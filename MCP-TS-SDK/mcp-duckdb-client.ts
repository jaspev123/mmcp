import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { TextDecoder } from "util";
import { Buffer } from 'buffer';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const modelId = "arn:aws:bedrock:eu-north-1:652477483543:inference-profile/eu.anthropic.claude-3-7-sonnet-20250219-v1:0";
const bedrockClient = new BedrockRuntimeClient({ region: "eu-north-1" });

export class MCPDuckDBAgent {
  private mcpClient: Client;
  private mcpTransport: StdioClientTransport;
  private isConnected: boolean = false;

  constructor() {
    // Initialize MCP client
    this.mcpClient = new Client({
      name: "DuckDB-Agent",
      version: "1.0.0"
    });

    // Initialize transport for MCP server
    this.mcpTransport = new StdioClientTransport({
      command: "tsx",
      args: ["mcp-duckdb-server"] // Path to your compiled MCP server
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.mcpClient.connect(this.mcpTransport);
      this.isConnected = true;
      console.log('Connected to MCP DuckDB server');
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.mcpClient.close();
      this.isConnected = false;
      console.log('Disconnected from MCP server');
    }
  }

  async callBedrock(question: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }

    try {
      // Get database schema using MCP
      const schemaResource = await this.mcpClient.readResource({
        uri: "duckdb://schema"
      });

      const schemaData = JSON.parse(schemaResource.contents[0].text +'' || '[]');
      console.log("Schema data retrieved from MCP:", schemaData);

      // Generate SQL using LLM
      const sql = await this.generateSQLWithLLM(schemaData, question);
     

      // Execute SQL using MCP
      const queryResult  = await this.mcpClient.callTool({
        name: "execute-sql",
        arguments: {
          sql: sql,
          limit: 100
        }
      });

      if (queryResult.isError) {
        console.error("SQL execution error:", queryResult + '');
        return;
      }

      const content = queryResult.content as { text: string }[];
const qryText = content[0].text;
      const results = JSON.parse(qryText);  
      console.log("Query results:", results);

      // Optional: Analyze query performance
      await this.analyzeQueryPerformance(sql);

    } catch (error) {
      console.error('Error in callBedrock:', error);
      throw error;
    }
  }

  private async generateSQLWithLLM(schemaData: any[], question: string): Promise<string> {
    const schemaText = JSON.stringify(schemaData, null, 2);
    const prompt = this.getPrompt(schemaText, question);

    const messageBody = {
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
    };

    return await this.modelCommandExecutor(messageBody);
  }

  private async analyzeQueryPerformance(sql: string): Promise<void> {
    try {
      const analysisResult = await this.mcpClient.callTool({
        name: "analyze-query",
        arguments: {
          sql: sql
        }
      });

      if (!analysisResult.isError) {
        const content = analysisResult.content as { text: string }[];
        console.log("Query analysis:", content[0].text);
      }
    } catch (error) {
      console.log("Query analysis not available or failed:", error);
    }
  }

  // Enhanced method to get suggestions from MCP server
  async getSQLSuggestion(question: string, context?: string): Promise<string> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }

    try {
      // Use MCP tool to generate SQL suggestions
      const suggestionResult = await this.mcpClient.callTool({
        name: "generate-sql",
        arguments: {
          question: question,
          context: context
        }
      });

      if (suggestionResult.isError) {
        const content = suggestionResult.content as { text: string }[];
        throw new Error(`SQL generation error: ${content[0].text}`);
      }

      const content = suggestionResult.content as { text: string }[];
      return content[0].text || '';
    } catch (error) {
      console.error('Error getting SQL suggestion:', error);
      throw error;
    }
  }

  // Method to get available tables
  async getAvailableTables(): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }

    try {
      const tablesResource = await this.mcpClient.readResource({
        uri: "duckdb://tables"
      });

      const content = tablesResource.contents as { text: string }[];
      return JSON.parse(content[0].text || '[]');
    } catch (error) {
      console.error('Error getting available tables:', error);
      throw error;
    }
  }

  // Method to execute custom SQL
  async executeCustomSQL(sql: string, limit: number = 100): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }

    try {
      const result = await this.mcpClient.callTool({
        name: "execute-sql",
        arguments: {
          sql: sql,
          limit: limit
        }
      });

      const content = result.content as { text: string }[];

      if (result.isError) {
        throw new Error(`SQL execution error: ${content[0].text}`);
      }

      return JSON.parse(content[0].text || '[]');
    } catch (error) {
      console.error('Error executing custom SQL:', error);
      throw error;
    }
  }

  // Method to use MCP prompts for SQL optimization
  async optimizeQuery(sql: string, performanceIssues?: string): Promise<string> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }

    try {
      const prompt = await this.mcpClient.getPrompt({
        name: "optimize-query",
        arguments: {
          sql: sql,
          performance_issues: performanceIssues || ''
        }
      });

      // Send the prompt to the LLM
      const messageBody = {
        messages: prompt.messages,
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1500,
      };

      return await this.modelCommandExecutor(messageBody);
    } catch (error) {
      console.error('Error optimizing query:', error);
      throw error;
    }
  }

  private getPrompt(schemaData: string, question: string): string {
    return `
I have a DuckDB database with the following schema:

${schemaData}

Please generate a SQL query to answer this question:
${question}

Requirements:
- Return only the SQL statement, no explanations or formatting
- Use proper DuckDB syntax and functions
- Ensure the query is safe and well-formed
- Use the exact table_name and column_name from the schema provided
- Consider performance implications

SQL Query:`;
  }

  private async modelCommandExecutor(body: Object): Promise<string> {
    const command = new InvokeModelWithResponseStreamCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: Buffer.from(JSON.stringify(body)),
    });

    try {
      const response = await bedrockClient.send(command);
      let fullResponse = "";

      for await (const chunk of response.body!) {
        const bytes = chunk.chunk?.bytes;
        if (bytes) {
          const text = new TextDecoder().decode(bytes);
          const parsed = JSON.parse(text);
          fullResponse += parsed?.delta?.text || "";
        }
      }

      return fullResponse.trim();
    } catch (err) {
      console.error("Error calling Bedrock:", err);
      throw err;
    }
  }

  // Method to list available MCP resources
  async listAvailableResources(): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }

    try {
      const resources = await this.mcpClient.listResources();
      return resources.resources;
    } catch (error) {
      console.error('Error listing resources:', error);
      throw error;
    }
  }

  // Method to list available MCP tools
  async listAvailableTools(): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }

    try {
      const tools = await this.mcpClient.listTools();
      return tools.tools;
    } catch (error) {
      console.error('Error listing tools:', error);
      throw error;
    }
  }

  // Method to list available MCP prompts
  async listAvailablePrompts(): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }

    try {
      const prompts = await this.mcpClient.listPrompts();
      return prompts.prompts;
    } catch (error) {
      console.error('Error listing prompts:', error);
      throw error;
    }
  }
}

// Example usage
async function main() {
  const agent = new MCPDuckDBAgent();
  
  try {
    await agent.initialize();
    
    // List available resources, tools, and prompts
    console.log('Available resources:', await agent.listAvailableResources());
    console.log('Available tools:', await agent.listAvailableTools());
    console.log('Available prompts:', await agent.listAvailablePrompts());
    
    // Example queries
    await agent.callBedrock("Show me all users created in the last 30 days");
    
    // Example of getting SQL suggestions
    const suggestion = await agent.getSQLSuggestion(
      "Find the top 10 customers by total order value",
      "Focus on customers with orders in the current year"
    );
    console.log('SQL Suggestion:', suggestion);
    
    // Example of query optimization
    const optimized = await agent.optimizeQuery(
      "SELECT * FROM users WHERE created_at > '2024-01-01'",
      "Query is running slowly on large dataset"
    );
    console.log('Optimized Query:', optimized);
    
  } catch (error) {
    console.error('Error in main:', error);
  } finally {
    await agent.disconnect();
  }
}

// Export the class and run example if this file is executed directly
export default MCPDuckDBAgent;

/*
if (require.main === module) {
  main().catch(console.error);
}
*/