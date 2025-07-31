import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { TextDecoder } from "util";
import { Buffer } from 'buffer';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { callOllamaLLJson, callOllamaLLM, ChatMessage, OllamaLLMResponse, OllamaLLMResponseJSON } from "./ollamaLLM";

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
      version: "22"
    });
    
    this.mcpTransport = new StdioClientTransport({
      command: "tsx",
      args: ["duckdb-server22"] // Path to your compiled MCP server
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

  async callLLMLoop(question: string,llmFunction: (q: string) => Promise<any>): Promise<string> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }
    try {      
    
/*       const toolsResponse = await this.mcpClient.listTools()
      const available_tools = toolsResponse.tools.map(tool => ({
          "name": tool.name,        
          "input_schema": tool.inputSchema
      }))   */


      const initialPrompt  = await this.mcpClient.getPrompt({
        name: "initial-instructions",
        arguments: {
          question: question,
          contextTip: "undefined"
        }
      });
      console.log("Initial prompt from MCP server: ****\n", initialPrompt.messages, "\n****");
      const promptTextExplanation =`
      !!!!!!!!!!!!!!
      The prompt contains instructions for LLM  on how respond in JSON format only and in a way that
      Agent can process the response and identify what to do. This makes the prompt tightly coupled with the agent implementation.
      This not how MCP ideally is meant to be used. 

      !!!!!!!!!!!!!!      
      `;
      console.log(promptTextExplanation);
      const promptText: string = initialPrompt.messages
        .map(msg => msg.content.text)
        .join('\n');
        
      const response = await llmFunction(promptText);  
      console.log("Initial Response from LLM: ******\n", response, "\n******");
      let objResponse = JSON.parse(response); 
      

      // Process LLM response
     
      let doMoreWorkWithLLM = true;
      let llmContextTip: any = "";
      const finalText: string[] = [];
      let i = 0;

      while (doMoreWorkWithLLM) {
        llmContextTip = ""
        console.log("LLM call loop counter: ", i++);
        let sqlSchema = "";

        if (objResponse.contentType === "text") {    // llm is done with creating the sql query      
          doMoreWorkWithLLM = false;
          console.log("--- SQL query from LLM:\n", objResponse.text);
          finalText.push(objResponse.text);          
          break;           
        } else if (objResponse.contentType === "resource_call") {

          if (objResponse.resource_name === "ALL") {
            const resources = await this.mcpClient.listResources();
            llmContextTip = JSON.stringify(resources.resources, null, 2);
            llmContextTip = { 
              description : `use this resource information find out more abou available resources.
               `,
              resourceInfo : llmContextTip
              
            };
            llmContextTip =JSON.stringify(llmContextTip, null, 2);
            
          } else {
            const resourceCall = objResponse;            
            const resourceResult = await this.mcpClient.readResource({                        
              uri: resourceCall.resource_uri ,            
              
            });
            const mcp_resourceCall_explation: string = 
            `
            !!!!!  
            prompt text was explicitly leading the LLM to respond in a way so
              that this 'else' would be activated and sqlSchema would be injected. True MCP
              is not leading the LLM to respond in a way that fetches resources by LLMs choice.
            !!!!!
            `                     
            ;            
            sqlSchema = resourceResult.contents[0].text +'';  //because we expect this, NOT THE RIGHT MCP WAY    
            
            llmContextTip = { 
              description : "use this resource to learn more about the data to help you perform the requested task}",              
            };
            llmContextTip =JSON.stringify(llmContextTip, null, 2);
          }
        } else if (objResponse.contentType === "prompt_call") {
          // this will never be called with current prompt
          
          if (objResponse.prompt_name === "ALL") {
            const prompts = await this.mcpClient.listPrompts();
            llmContextTip = JSON.stringify(prompts.prompts, null, 2);
            llmContextTip = { 
              resourceInfo : llmContextTip,
              description : `use this prompt information find out additional rules
              . use format {"contentType":"prompt_call", "prompt_name": "<prompt_name>"}`
            };
            llmContextTip =JSON.stringify(llmContextTip, null, 2);
          } else {
            const promptCall = objResponse;
            const promptResult = await this.mcpClient.getPrompt({
              name: promptCall.prompt_name,
              arguments: promptCall.arguments 
            });
            llmContextTip = { 
              resourceInfo : promptResult.messages,
              description : "use the prompt information to aquire more prompts that may provvide more information"
            };
            llmContextTip =JSON.stringify(llmContextTip, null, 2);            
          }
        }
        else if (objResponse.contentType === "tool_call") {
          // this will never be called with current prompt
          if (objResponse.tool_name === "ALL") {
            const tools = await this.mcpClient.listTools();
            llmContextTip = JSON.stringify(tools.tools, null, 2);
            llmContextTip = { 
              description : `use this tool information to aquire more tools that you can call.
               use format {"contentType":"tool_call", "tool_name": "<tool_name>"}`,
              resourceInfo : llmContextTip,
              
            };
            llmContextTip =JSON.stringify(llmContextTip, null, 2);
          } else {            
            const toolResult = await this.mcpClient.callTool({
              name: objResponse.tool_name,
              
            });
            const content = toolResult.content as { text: string }[];
            llmContextTip = {
              description : `You called tool: ${objResponse.tool_name}`,
              mcpResponse: JSON.parse(content[0].text + '' || '[]'),
               
            }
            llmContextTip =JSON.stringify(llmContextTip, null, 2);             
          }
          
        }        
        const promptFromServer  = await this.mcpClient.getPrompt({
          name: "initial-instructions",
          arguments: {
            question: question,
            contextTip: llmContextTip,
            sqlSchema: sqlSchema
          }
        });
        console.log("Refined prompt from MCP server with schema injected:\n", promptFromServer.messages);
  
        const promptText: string = promptFromServer.messages
          .map(msg => msg.content.text)
          .join('\n');

        const response = await llmFunction(promptText);        
        //console.log("loop Response from LLM:\n", response);
        objResponse = typeof response === 'string' ? safeParseJson(response) : response;         
      }

      const sql = finalText.join("\n");      

      const sqlusageRemarks = 
      `
      !!!!!
      at this point in code, the LLM has created the sql query. 
      so this tool call is not initiated by LLM, but by the host/agent
      
      !!!!!
      `;
      console.log(sqlusageRemarks);

      // Execute SQL using MCP tool
      const queryResult = await this.mcpClient.callTool({
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

    } catch (error: any) {
      console.error('Error in callLLMLoop:', error);
      throw error;
    }
  }

  async generateSQLWithBedrockLLM(promptData: string): Promise<any> {
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
  
   async generateSQLWithOllamaLLM(promptData : string): Promise<any> {
    const messageBody = promptData;
    //started using ollama context 
    const result  : OllamaLLMResponseJSON = await callOllamaLLJson("llama3.2", messageBody, this.ollmaContext);     
    this.ollmaContext = result.context;
    return result.response;
  }

  // Enhanced method to get suggestions from MCP server
  async getSQLSuggestion(question: string, context?: string): Promise<string> {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call initialize() first.');
    }
    console.log(" getSQLSuggestion:", question, context);

    try {      
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

