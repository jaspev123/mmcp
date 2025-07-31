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
const requirements = `
Requirements:
- Return only the SQL query, no explanation or formatting or any other text. return only the sql statement - not any other text. do not print any formatting.
- Use proper DuckDB syntax and functions
- Ensure the query is safe and well-formed
- Consider performance implications
- TO_VARCHAR" is not duckdb function
- TO_CHAR" is not duckdb function
- columns with aggregate functions must appear in the group by clause
- DATE_FORMAT is not a duckdb function. use STRFTIME instead
- Only include columns in SELECT that are either aggregated or listed in GROUP BY.
`;

const server = new McpServer({
  name: "DuckDB Query Server",
  version: "1.0.0"
});

const duckDB = new DuckDBManager();

server.resource(
  "database-schema",
  "duckdb://schema",
  {
    title: "Database Schema information",          // Display title
    mimeType: "application/json",        // Content type
    annotations: {
      version: "1.0",
      author: "dev-team"
    }
  },
  
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
          text: JSON.stringify(schemaData, null, 2),
          description: "Database schema information for sql generation"
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
    schema: z.string().optional().describe("Database schema information. Obtain this using the database-schema resource"),
    requirements: z.string().optional().describe("Additional-requirements for SQL query generation. Obtain these from other available resources")
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

Requirements: ${requirements}

`
      }
    }]
  })
);



server.prompt(
  "initial-instructions",
  {
    question: z.string().describe("Natural language question"),
    contextTip: z.string().optional().describe("Additional-requirements for SQL query generation. add these to the sql-assistant prompt"),
    sqlSchema: z.string().optional().describe("sql schema")
    
  },
  ({ question, contextTip, sqlSchema }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `You are a SQL expert.  Given the following database schema (if available)and a user Question, generate a valid DuckDB SQL query
      SQL generation Requirements:
      
      - Once you have generated the SQL query, respond in json format like this: {"contentType":"text", "text": "<the sql_query"} .
      - Return only the SQL query like described above, no explanation or formatting or any other text. return only the sql statement - not any other text. do not print "${illegalSql} or any other formatting.
      - Use proper DuckDB syntax and functions
      - Ensure the query is safe and well-formed
      - Consider performance implications
      - TO_VARCHAR" is not duckdb function
      - TO_CHAR" is not duckdb function
      - columns with aggregate functions must appear in the group by clause
      - DATE_FORMAT is not a duckdb function. use STRFTIME instead
      - FORMAT_DATE is not a duckdb function. use STRFTIME instead
      - STRFTIME is a duckdb function. see variations below      	
      - strftime(DATE, VARCHAR) -> VARCHAR
      - strftime(TIMESTAMP, VARCHAR) -> VARCHAR
      - strftime(TIMESTAMP_NS, VARCHAR) -> VARCHAR
      - strftime(VARCHAR, DATE) -> VARCHAR
      - strftime(VARCHAR, TIMESTAMP) -> VARCHAR
      - strftime(VARCHAR, TIMESTAMP_NS) -> VARCHAR
      - strftime(TIMESTAMP WITH TIME ZONE, VARCHAR) -> VARCHAR
      - Only include columns in SELECT that are either aggregated or listed in GROUP BY.

      Operational Requirements:
       - allways respond in json structure {"contentType":"text", "text": "<the sql_query>"}  or using other response type such as described belo.
        - You must find the database schema and then generate a sql query to answer the question.  use table names from schema, no guessing !     
        - To retrieves the database schema, respond with json message : {"contentType":"resource_call", "resource_uri": "duckdb://schema"}                 
        - Once you have schema (in Database Schema section) , you must make only tool calls.              
        - Allways answer in json formats as  described above. Do not print any human readable text such as : "I" need to retrieve the schema to generate the correct SQL query"
       
     Database Schema, if available: ${sqlSchema}

        Question: ${question}

        Additional Context below helps find further actions to generate the sql query that satisfied the Question given in bottom.

        Additional Context: ${contextTip}        

        `
      }
    }]
  })
);

server.prompt(
  "additional-instructions",
  {
    question: z.string().describe("Natural language question"),
    
  },
  ({ question }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `You are a SQL expert. You must use tools, prompts and resources to generate SQL queries.         
        To get available tools, respond in json format with: {"contentType":"tool_call", "tool_name": "ALL",} .
        To use a tool, respond in json format with: {"contentType":"tool_call", "tool_name": "tool_name", "arguments": "arguments"} .

      here is 

        `
      }
    }]
  })
);

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

// Start the server
main().catch(console.error);

export { server, duckDB };
