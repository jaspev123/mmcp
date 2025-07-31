import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { TextDecoder } from "util";
import { Buffer } from 'buffer';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { callOllamaLLJson, callOllamaLLJsonWithTools, callOllamaLLM, ChatMessage, OllamaLLMResponse, OllamaLLMResponseJSON, OllamaLLMResponseToolsMessage, OllamaLLMTool } from "./ollamaLLM";
import { text } from "express";

const modelId = "arn:aws:bedrock:eu-north-1:652477483543:inference-profile/eu.anthropic.claude-3-7-sonnet-20250219-v1:0";
const bedrockClient = new BedrockRuntimeClient({ region: "eu-north-1" });

function safeParseJson(jsonString: string) {
  try {
    // This will only work if the string is almost-valid JSON
    return JSON.parse(jsonString);
  } catch (e) {
    // Clean string values by escaping unescaped newlines inside them
    const fixedString = jsonString.replace(/"text":\s*"([\s\S]*?)"/, (match, textContent) => {
      const escapedText = textContent
        .replace(/\\/g, '\\\\') // escape existing backslashes
        .replace(/"/g, '\\"')   // escape double quotes
        .replace(/\r?\n/g, '\\n'); // escape newlines
      return `"text":"${escapedText}"`;
    });
    // Try parsing again
    return JSON.parse(fixedString);
  }
}


export class MCPDuckDBAgent {
  private mcpClient: Client;
  private mcpTransport: StdioClientTransport;
  private isConnected: boolean = false;
  private ollmaContext : any[] = [];

  constructor() {
    // Initialize MCP client
    this.mcpClient = new Client({
      name: "DuckDB-Agent",
      version: "33"
    });

    // Initialize transport for MCP server
    this.mcpTransport = new StdioClientTransport({
      command: "tsx",
      args: ["duckdb-server33"] // Path to your compiled MCP server
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

  async callLLMLoop(question: string,llmFunction: (q: ChatMessage[], tools: any[]) => Promise<any>): Promise<any> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }
    try {      
        const toolsResponse = await this.mcpClient.listTools();         
        const schemaResource = await this.mcpClient.readResource({
          name: "database-schema",
          uri: "duckdb://schema"
        });
        const schemaData = JSON.parse(schemaResource.contents[0].text +'' || '[]');    
        const schemaText = JSON.stringify(schemaData, null, 2);  

        const promptFromServer  = await this.mcpClient.getPrompt({
          name: "sql-assistant",
          arguments: {
            question: question,                       
            schema: schemaText                   
          }
        });

        let doMoreWorkWithLLM = true;
        
        const finalText: string[] = [];
        let iloopCounter= 0;

        const messages: ChatMessage[] = [
          {
            role: "user",
            content: promptFromServer.messages[0].content.text,
          }
        ];
        let currentMessages = [...messages];    

        while (doMoreWorkWithLLM) {                                  
            const response = await llmFunction(currentMessages, toolsResponse.tools);                         
            currentMessages.push({
              role: "assistant",
              content: response.message.content,
              ...(response.message.tool_calls && {
                tool_calls: response.message.tool_calls
              })
            });
            console.log("\n Normal LLM call response: ", JSON.stringify(response.message, null, 2));
            
            if (!response.message.tool_calls || response.message.tool_calls.length === 0) {          
              return response.message.content;
            }
            
            for (const toolCall of response.message.tool_calls) {          
                const toolName = toolCall.function.name;
                let toolArgs = toolCall.function.arguments   
                //cheating - if no arguments, use the content
                if(Object.keys(toolArgs).length === 0) {
                  const toolArgsParam = {
                    sql: response.message.content,
                    limit: 50
                  };
                  toolArgs = toolArgsParam;
                }
                console.log("\n Tool Arguments for toolCall: ", toolArgs);
                          
                // Execute the MCP tool
                const  toolResult = await this.mcpClient.callTool({
                  name: toolName,            
                  arguments: toolArgs
                });
                console.log(`Tool result for : ${toolName}`, JSON.stringify(toolResult, null, 2),"\n ");
                const toolResultText = toolResult.content as { text: string }[];
                
                // Add tool result as a tool message, this will be used as a context for the next LLM call
                currentMessages.push({
                  role: "tool",
                  content: toolResult.isError ? `Tool Error: ${JSON.stringify(toolResult, null, 2)}` : toolResult.content as { text: string }[][0]
              });
              if(! toolResult.isError) {
                doMoreWorkWithLLM = false;  // stop looping if model is not converging                
                return toolResultText[0].text;
              }
              
            }
            iloopCounter++;
            if (iloopCounter > 5) {
              doMoreWorkWithLLM = false;  // stop looping if model is not converging
              console.log("\n Looping stopped - model is not converging");
            }
            
        }        

    } catch (error: any) {
      console.error('Error in callLLMLoop:', error);
      throw error;
    }
  }

  
   async generateSQLWithOllamaLLM(messages :ChatMessage[], tools: any[]): Promise<any> {    
    const ollamaTools = await this.convertMcpToolsToOllama(tools);    
    //console.dir(messages, { depth: null, colors: true });
    const result  : OllamaLLMResponseToolsMessage = await callOllamaLLJsonWithTools("llama3.2", messages, ollamaTools, this.ollmaContext);         
    return result
  }


  
  async convertMcpToolsToOllama(tools: any[]): Promise<OllamaLLMTool[]> {    
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "No description provided",
        parameters: { type : "object", properties: tool.inputSchema.properties}
      },
    }));
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

