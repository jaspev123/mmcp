import MCPDuckDBAgent from './duckdb-agent33';

(async () => {
  const agent = new MCPDuckDBAgent();

  try {    
    const args = process.argv.slice(2);
    await agent.initialize();    

    if (args.includes("MCP")) {

      const resources = await agent.listAvailableMCPResources();
      console.log('Available MCP resources:', JSON.stringify(resources, null, 2));
      const tools = await agent.listAvailableMCPTools();
      console.log('Available MCP tools:', JSON.stringify(tools, null, 2));
      const prompts = await agent.listAvailableMCPPrompts();
      console.log('Available MCP prompts:', JSON.stringify(prompts, null, 2)); 
      process.exit(0);
    }

    const taxi_trips_distance_per_month_query: string = 
    `
    list taxi trips from database having the greatest trip distance per each month  ie. montly maximum ride.   
    also list the year in separate column.  
    show  months with a human readable name.
    
        
    `                     
    ; 

    const longest_trip_query: string = 
    `
find the one taxi trip that has longest trip distance  and show it to me (all columns)
    
    `                     
    ;
    let result: string = "";
    console.log("Question:\n",taxi_trips_distance_per_month_query);   
    result = await agent.callLLMLoop(taxi_trips_distance_per_month_query, agent.generateSQLWithOllamaLLM.bind(agent));     

    console.log("-----\n","Query results from LLM generated SQL:\n\n", result,"-----\n"); 
    
  } catch (err) {
    console.error("Error running MCPDuckDBAgent:", err);
  } finally {    
    await agent.disconnect();
  }
})();
