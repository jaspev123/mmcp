import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Database } from 'duckdb-async';


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
    console.log("SQL query on Server:", sql);

    try {
      const result = await this.db.all(sql);
      console.log("SQL query result on Server:", result);
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

const illegalSql = "```sql";

// Create the MCP server
const requirements = `
Requirements:
- Return only the SQL query, no explanation or formatting or any other text. return only the sql statement - not any other text. do not print "${illegalSql} or any other formatting 
or new line characters.
- Use proper DuckDB syntax and functions
- Ensure the query is safe and well-formed
- Consider performance implications
- TO_VARCHAR" is not duckdb function
- TO_CHAR" is not duckdb function
- columns with aggregate functions must appear in the group by clause
- DATE_FORMAT is not a duckdb function. use STRFTIME instead
- Only include columns in the SELECT list that are either aggregated or listed in GROUP BY when generating a
with group by clause
`;

export async function createMcpServer() {
const mcpServer = new McpServer({
  name: "DuckDB Query Server HTTP",
  version: "1.0.0"
});
// Initialize DuckDB
const duckDB = new DuckDBManager();
await duckDB.initialize('./database/data.duckdb'); 

// define a resource: Get database schema information
mcpServer.resource(
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
      console.log("Resource Schema data:", schemaData);

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

mcpServer.tool(
  "execute-sql",
  "excute sql queries using known schema",
  {
    sql: z.string().describe("SQL query to execute against the DuckDB database"),
      },
  async ({ sql }) => {
    try {      
       
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

mcpServer.prompt(
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
${requirements}

Finally: execute the generated SQL query using the a tool.
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

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  })

  await mcpServer.connect(transport);
  process.on('SIGINT', async () => {
    await duckDB.close();
    process.exit(0);
  });
  return {transport};
}


