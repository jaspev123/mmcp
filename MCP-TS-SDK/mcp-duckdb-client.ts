import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { TextDecoder } from "util";
import { Buffer } from 'buffer';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { callOllamaLLM, OllamaLLMResponse } from "./ollamaLLM";

const modelId = "arn:aws:bedrock:eu-north-1:652477483543:inference-profile/eu.anthropic.claude-3-7-sonnet-20250219-v1:0";
const bedrockClient = new BedrockRuntimeClient({ region: "eu-north-1" });

export class MCPDuckDBAgent {
  private mcpClient: Client;
  private mcpTransport: StdioClientTransport;
  private isConnected: boolean = false;
  //private tools: Tool[] = [];

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

  async callLLM(question: string,llmFunction: (q: string) => Promise<string>): Promise<string> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }
    try {
      // Get database schema using MCP (client knows about the server)
      const schemaResource = await this.mcpClient.readResource({
        name: "database-schema",
        uri: "duckdb://schema"
      });
      const schemaData = JSON.parse(schemaResource.contents[0].text +'' || '[]');
      console.log("Schema data retrieved from MCP server:", schemaData);      
      const schemaText = JSON.stringify(schemaData, null, 2);   
      // get prompt to query the mnodel with
      const promptFromServer  = await this.mcpClient.getPrompt({
        name: "sql-assistant",
        arguments: {
          question: question,
          schema: schemaText
        }
      });
      console.log("prompt from MCP server: \n", promptFromServer.messages);  
      // Generate SQL using LLM
      //const sql = await this.generateSQLWithBedrockLLM(promptFromServer.messages);     
      // Extract text content from messages
      const promptText: string = promptFromServer.messages
        .map(msg => msg.content.text)
        .join('\n');
      const sql = await llmFunction(promptText);     
      console.log("SQL generated from LLM:\n", sql);
      // Execute SQL using a MCP tool (client knows about the server)
      const queryResult  = await this.mcpClient.callTool({
        name: "execute-sql",
        arguments: {
          sql: sql,
          limit: 100
        }
      });

      if (queryResult.isError) {
        const content = queryResult.content as { text: string }[];
        const errorText = content[0].text;
        console.error("SQL execution error:", errorText);
        return errorText;
      }
      const content = queryResult.content as { text: string }[];
      const qryText = content[0].text;
      const results = JSON.parse(qryText);        
      return results;

    } catch (error) {
      console.error('Error in callBedrock:', error);
      throw error;
    }
  }

   async generateSQLWithBedrockLLM(promptData : string): Promise<string> {
    const messageBody = {
      messages: [
        {
          role: "user",
          content:  promptData,
        },
      ],
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
    };
    return await this.bedrockModelCommandExecutor(messageBody);
  }

   async generateSQLWithOllamaLLM(promptData : string): Promise<string> {
    const messageBody = promptData;
    const result  : OllamaLLMResponse = await callOllamaLLM("llama3.2", messageBody); 
    return result.response;
  }



  // Enhanced method to get suggestions from MCP server
  async getSQLSuggestion(question: string, context?: string): Promise<string> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }
    console.log(" getSQLSuggestion:", question, context);

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
    console.log(" executeCustomSQL:", sql);

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

      return await this.bedrockModelCommandExecutor(messageBody);
    } catch (error) {
      console.error('Error optimizing query:', error);
      throw error;
    }
  }

  private getPrompt(schemaData: string, question: string): string {
    console.log("getPrompt");
    return `
I have a DuckDB database with the following schema:

${schemaData}

Please generate a SQL query to answer this question:
${question}

Requirements:
- Return only the SQL statement, no explanations or formatting. return only the sql statement. 
- Use proper DuckDB syntax and functions. " TO_VARCHAR" is not duckdb function
- Ensure the query is safe and well-formed
- Use the exact table_name and column_name from the schema provided
- Consider performance implications

SQL Query:`;
  }

  private async bedrockModelCommandExecutor(body: Object): Promise<string> {
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
  async listAvailableMCPResources(): Promise<any[]> {
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

  
  async listAvailableMCPTools(): Promise<any[]> {
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
  async listAvailableMCPPrompts(): Promise<any[]> {
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

export default MCPDuckDBAgent;

