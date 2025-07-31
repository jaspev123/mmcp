import MCPDuckDBAgent from './mcp-duckdb-agent';

(async () => {
  const agent = new MCPDuckDBAgent();

  try {    
    const args = process.argv.slice(2);
    await agent.initialize();    

    if (args.includes("MCP")) {

      console.log('Available MCP resources:', await agent.listAvailableMCPResources());
      console.log('Available MCP tools:', await agent.listAvailableMCPTools());
      console.log('Available MCP prompts:', await agent.listAvailableMCPPrompts()); 
      process.exit(0);
    }

    const taxi_trips_distance_per_month_query: string = 
    `
    list taxi trips that have the largest 
    trip distance for each month (also show the year in separate column). 
    format dates like like 'mm.dd.yyyy'.
    give  months a human redable name    
    `
    ;
   let result: string = "";
    if (args.includes("ollama")) {
      result = await agent.callLLM(taxi_trips_distance_per_month_query, agent.generateSQLWithOllamaLLM.bind(agent));
    } else {
      result = await agent.callLLM(taxi_trips_distance_per_month_query, agent.generateSQLWithBedrockLLM.bind(agent));
    }
    
    console.log("Query results from LLM generated SQL:\n\n","-----\n", result,"-----\n");
  } catch (err) {
    console.error("Error running MCPDuckDBAgent:", err);
  } finally {    
    await agent.disconnect();
  }
})();
