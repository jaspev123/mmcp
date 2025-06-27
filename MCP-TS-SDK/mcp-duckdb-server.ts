import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Database } from 'duckdb-async';

// Type definitions for better type safety
interface TableInfo {
  table_name: string;
  column_name: string;
  data_type: string;
}

interface QueryResult {
  [key: string]: any;
}

class DuckDBManager {
  private db: Database | null = null;

  async initialize(dbPath: string = ':memory:'): Promise<void> {
    console.log('Initializing DuckDB with path:', dbPath);
    this.db = await Database.create(dbPath);
  }

  async query(sql: string): Promise<QueryResult[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    console.log("SQL query:", sql);

    try {
      const result = await this.db.all(sql);
      return result;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}

// Create the MCP server
const server = new McpServer({
  name: "DuckDB Query Server",
  version: "1.0.0"
});

// Initialize DuckDB
const duckDB = new DuckDBManager();

// Resource: Get database schema information
server.resource(
  "database-schema",
  "duckdb://schema",
  async (uri) => {
    try {
      const schemaQuery = `
        SELECT
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM
          information_schema.columns
        WHERE
          table_schema = 'main'
        ORDER BY
          table_name,
          ordinal_position;
      `;

      const schemaData = await duckDB.query(schemaQuery);

      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(schemaData, null, 2)
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `Error retrieving schema: ${error}`
        }]
      };
    }
  }
);

// Resource: Get table list
server.resource(
  "table-list",
  "duckdb://tables",
  async (uri) => {
    try {
      const tablesQuery = `
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE table_schema = 'main'
        ORDER BY table_name;
      `;

      const tables = await duckDB.query(tablesQuery);

      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(tables, null, 2)
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `Error retrieving tables: ${error}`
        }]
      };
    }
  }
);

function extractSQL(rawText : string) {
  return rawText
    .replace(/^```sql\s*/i, '') // remove opening ```sql
    .replace(/```$/, '')        // remove closing ```
    .trim();                    // clean up extra whitespace
}

// Tool: Execute SQL query
server.tool(
  "execute-sql",
  {
    sql: z.string().describe("SQL query to execute against the DuckDB database"),
    limit: z.number().optional().default(100).describe("Maximum number of rows to return")
  },
  async ({ sql, limit }) => {
    try {
      // Add LIMIT clause if not present and limit is specified

      console.log(" before finalSql"); 
      let finalSql = extractSQL(sql.trim());
      console.log("finalSql", finalSql); 


      const results = await duckDB.query(finalSql);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(results, null, 2)
        }],
        isError: false
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `SQL execution error: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Generate SQL from natural language
server.tool(
  "generate-sql",
  {
    question: z.string().describe("Natural language question to convert to SQL"),
    context: z.string().optional().describe("Additional context about the query")
  },
  async ({ question, context }) => {
    try {
      // Get schema information
      const schemaQuery = `
        SELECT
          table_name,
          column_name,
          data_type
        FROM
          information_schema.columns
        WHERE
          table_schema = 'main'
        ORDER BY
          table_name,
          ordinal_position;
      `;

      const schemaData = await duckDB.query(schemaQuery);
      const schemaText = JSON.stringify(schemaData, null, 2);

      // Return the schema and question for the LLM to process
      return {
        content: [{
          type: "text",
          text: `Schema Information:\n${schemaText}\n\nQuestion: ${question}\n\nContext: ${context || 'None'}\n\nPlease generate a SQL query based on this information.`
        }],
        isError: false
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error generating SQL: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Analyze query performance
server.tool(
  "analyze-query",
  {
    sql: z.string().describe("SQL query to analyze")
  },
  async ({ sql }) => {
    try {
      const explainQuery = `EXPLAIN ANALYZE ${sql}`;
      const analysis = await duckDB.query(explainQuery);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(analysis, null, 2)
        }],
        isError: false
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Query analysis error: ${error}`
        }],
        isError: true
      };
    }
  }
);

const illegalSql = "```sql";

// Prompt: SQL generation assistant
server.prompt(
  "sql-assistant",
  {
    question: z.string().describe("Natural language question"),
    schema: z.string().optional().describe("Database schema information")
  },
  ({ question, schema }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `You are a SQL expert. Given the following database schema and question, generate a valid DuckDB SQL query.

Database Schema:
${schema || 'Use the database-schema resource to get current schema'}

Question: ${question}

Requirements:
- Return only the SQL query, no explanation or formatting or any other text. return only the sql statement - not any other text. do not print "${illegalSql} or any other formatting.
- Use proper DuckDB syntax and functions
- Ensure the query is safe and well-formed
- Consider performance implications
- TO_VARCHAR" is not duckdb function
- TO_CHAR" is not duckdb function
- columns with aggregate functions must appear in the group by clause

`
      }
    }]
  })
);

// Prompt: Query optimization assistant
server.prompt(
  "optimize-query",
  {
    sql: z.string().describe("SQL query to optimize"),
    performance_issues: z.string().optional().describe("Known performance issues")
  },
  ({ sql, performance_issues }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `You are a SQL optimization expert. Analyze and optimize the following DuckDB query:

Original Query:
${sql}

${performance_issues ? `Known Issues: ${performance_issues}` : ''}

Please provide:
1. An optimized version of the query
2. Explanation of optimizations made
3. Potential performance improvements`
      }
    }]
  })
);

// Initialize and start the server
async function main() {
  try {
    console.log(" MCP server starts"); 
    // Initialize DuckDB
    await duckDB.initialize('./database/data.duckdb');
    console.log('DuckDB initialized successfully');
    // Create transport
    const transport = new StdioServerTransport();
    // Connect server to transport
    await server.connect(transport);
    console.log('MCP DuckDB Server started successfully');
    
    process.on('SIGINT', async () => {
      console.log('Shutting down gracefully...');
      await duckDB.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch(console.error);

export { server, duckDB };
