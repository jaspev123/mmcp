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

const server = new McpServer({
  name: "DuckDB Query Server",
  version: "1.0.0"
});

const duckDB = new DuckDBManager();

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

server.tool(
  "execute-sql",
  {
    sql: z.string().describe("SQL query to execute against the DuckDB database"),
    limit: z.number().optional().default(100).describe("Maximum number of rows to return")
  },
  async ({ sql, limit }) => {
    try {
      // Add LIMIT clause if not present and limit is specified
       
      let finalSql = extractSQL(sql.trim());
      
      const pre_results = await duckDB.query(finalSql);
      const results = convertBigInt(pre_results);
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
- DATE_FORMAT is not a duckdb function. use STRFTIME instead
- Only include columns in SELECT that are either aggregated or listed in GROUP BY.

`
      }
    }]
  })
);

// Prompt: Query optimization assistant


// Initialize and start the server
async function main() {
  try {
    
    
    await duckDB.initialize('./database/data.duckdb');    
    const transport = new StdioServerTransport();
    await server.connect(transport);    
    process.on('SIGINT', async () => {
      await duckDB.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}
function extractSQL(rawText : string) {
  return rawText
    .replace(/^```sql\s*/i, '') // remove opening ```sql
    .replace(/```$/, '')        // remove closing ```
    .trim();                    // clean up extra whitespace
}

function convertBigInt(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertBigInt);
  } else if (obj !== null && typeof obj === "object") {
    const newObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      newObj[key] = convertBigInt(value);
    }
    return newObj;
  } else if (typeof obj === "bigint") {
    return Number(obj); // or: return obj.toString();
  } else {
    return obj;
  }
}

// Start the server
main().catch(console.error);

export { server, duckDB };
