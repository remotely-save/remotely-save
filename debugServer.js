// Importing the http module
const http = require("http");

const requestHandler = (req, res) => {
  const body = [];
  req
    .on("data", (chunk) => {
      body.push(chunk);
    })
    .on("end", () => {
      const parsed = JSON.parse(Buffer.concat(body).toString());
      const prettyParsed = JSON.stringify(parsed, null, 2);
      console.log(prettyParsed);
      res.setHeader("Content-Type", "application/json");
      res.end(prettyParsed);
    });
};

const server = http.createServer(requestHandler);

const addr = "0.0.0.0";
const port = 3000;
server.listen(port, addr, undefined, () => {
  console.log(`Server is Running on ${addr}:${port}`);
});
