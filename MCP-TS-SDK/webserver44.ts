import express from "express";
import {createMcpServer} from "./duckdb-server44";

const app = express();
app.use(express.json());

let transport : any;


(async () => {
  // Initialize MCP once at startup
  ({ transport, } = await createMcpServer());

  app.post("/mcp", async (req, res) => {
    try {
      await transport.handleRequest(req, res, req.body);

/*       const authHeader = req.headers["authorization"];

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
  
      const token = authHeader.split(" ")[1];
      // TODO: validate token against your OAuth2.1 provider or JWKS
      if (token !== process.env.EXPECTED_TOKEN) {
        return res.status(403).json({ error: "Forbidden" });
      } */
    } catch (err) {
      console.error("Error handling MCP request:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  // Start the HTTP server
  app.listen(3001, "127.0.0.1", () => console.log("MCP HTTP server listening on port 3001"));
})();