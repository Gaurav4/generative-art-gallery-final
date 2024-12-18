const AWS = require('aws-sdk');
const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs");
const express = require('express');
const { getUnapprovedRecords, approvePrompts, denyPrompt } = require('./image_approver');
const upload_image = require('./file_uploader');
const table_writer = require('./table_writer');
const invoke_bedrock = require('./bedrock_client');
const updateCarousel = require('./image_carousel_updater');
const { getImageByOrderNumber } = require('./image_360_updater');
const port = process.env.PORT || 8080;
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const DYNAMODB_TABLE_NAME = 'reinvent-generativeart-gallery';
const COUNTER_TABLE_NAME = 'reinvent-generativeart-gallery-counter';
const S3_BUCKET_NAME = 'reinvent-generativeart-galleryv2';

AWS.config.update({ region: 'us-west-2' }); // Replace 'your-region' with the actual region

var app = express();
const server = http.createServer(app);

app.get('/', (request, response) => {
  const filename = path.join(process.cwd(), 'genai.html');
  serveFile(filename, response);
});

app.get('/viewer', (request, response) => {
  const filename = path.join(process.cwd(), 'genai_viewer.html');
  serveFile(filename, response);
});

app.get('/artist', (request, response) => {
  const filename = path.join(process.cwd(), 'genai.html');
  serveFile(filename, response);
});

app.get('/360', (request, response) => {
  const filename = path.join(process.cwd(), 'genai_360.html');
  serveFile(filename, response);
});


app.get('/lookup', (request, response) => {
  const filename = path.join(process.cwd(), 'genai_lookup.html');
  serveFile(filename, response);
});


app.get('/approver', (request, response) => {
  const filename = path.join(process.cwd(), 'genai_approver.html');
  serveFile(filename, response);
});


// New endpoint to fetch the image based on the order number in counter.txt
app.get('/getImageFromCounter', async (req, res) => {
  const imageData = await getImageFromCounterFile();
  res.json(imageData);
});

// Existing endpoint for manual order number lookup
app.get('/getImagePath', async (req, res) => {
  const orderNumber = parseInt(req.query.orderNumber, 10);
  if (isNaN(orderNumber)) {
    return res.json({ error: 'Invalid order number provided' });
  }

  const imageData = await getImageByOrderNumber(orderNumber);
  res.json(imageData);
});



app.get('/getImagePath360', async (req, res) => {
  const orderNumber = req.query.orderNumber;
  if (!orderNumber) {
      console.error('No order number provided');
      return res.json({ error: 'Order number is required' });
  }

  try {
      const numericOrderNumber = parseInt(orderNumber, 10);
      const params = {
          TableName: DYNAMODB_TABLE_NAME,
          FilterExpression: 'orderNumber = :orderNumber and approved = :approved',
          ExpressionAttributeValues: {
              ':orderNumber': numericOrderNumber,
              ':approved': true
          }
      };

      console.log(`Scanning DynamoDB for order number: ${numericOrderNumber}`);
      const data = await dynamoDB.scan(params).promise();

      if (data.Items.length === 0) {
          console.error(`Order not found in DynamoDB for order number: ${numericOrderNumber}`);
          return res.json({ error: 'Order not found' });
      }

      const item = data.Items[0];
      console.log(`Order found: ${JSON.stringify(item)}`);

      // Get image data from S3
      const s3ObjectParams = {
          Bucket: S3_BUCKET_NAME,
          Key: `${item.id}.png`
      };

      const s3Data = await s3.getObject(s3ObjectParams).promise();
      const imageData = s3Data.Body.toString('base64');

      return res.json({
          imageData: imageData,
          prompt: item.prompt
      });
  } catch (error) {
      console.error('Error fetching image from DynamoDB or S3:', error);
      return res.json({ error: `Failed to fetch image data: ${error.message}` });
  }
});


app.get('/serveImage', async (req, res) => {
  const orderNumber = req.query.orderNumber;
  if (!orderNumber) {
      console.error('No order number provided');
      return res.status(400).send('Order number is required');
  }

  try {
      const numericOrderNumber = parseInt(orderNumber, 10);
      const params = {
          TableName: 'reinvent-generativeart-gallery', // Correctly define your table name
          FilterExpression: 'orderNumber = :orderNumber and approved = :approved',
          ExpressionAttributeValues: {
              ':orderNumber': numericOrderNumber,
              ':approved': true
          }
      };

      console.log(`Fetching image for order number: ${numericOrderNumber}`);
      const data = await dynamoDB.scan(params).promise();

      if (!data.Items || data.Items.length === 0) {
          console.error(`No record found for order number: ${numericOrderNumber}`);
          return res.status(404).send('Image not found');
      }

      const item = data.Items[0];
      const s3ObjectParams = {
          Bucket: 'reinvent-generativeart-galleryv2', // Update this if your bucket name is different
          Key: `${item.id}.png`
      };

      const s3Data = await s3.getObject(s3ObjectParams).promise();

      res.set('Content-Type', 'image/png');
      res.send(s3Data.Body); // Stream the image binary
  } catch (error) {
      console.error('Error fetching image:', error);
      res.status(500).send(`Failed to fetch image: ${error.message}`);
  }
});



app.get('*', (request, response) => {
  try {
    var uri = url.parse(request.url).pathname,
        filename = path.join(process.cwd(), uri);

    var contentTypesByExtension = {
      '.html': "text/html",
      '.css': "text/css",
      '.js': "text/javascript",
      '.jpg': "image/jpeg",
      '.png': "image/png"
    };

    fs.exists(filename, function(exists) {
      if (!exists || filename == "prompt_server.js") {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.write("404 Not Found\n");
        response.end();
        return;
      }

      if (fs.statSync(filename).isDirectory()) {
        filename += 'genai.html';
      }

      fs.readFile(filename, "binary", function(err, file) {
        if (err) {
          response.writeHead(500, { "Content-Type": "text/plain" });
          response.write(err + "\n");
          response.end();
          return;
        }

        var headers = {};
        var contentType = contentTypesByExtension[path.extname(filename)];
        if (contentType) headers["Content-Type"] = contentType;
        response.writeHead(200, headers);
        response.write(file, "binary");
        response.end();
      });
    });
  } catch (e) {
    var now = new Date().toJSON().slice(0, 10).replace(/-/g, '/');
    var error_text = "HTTPS server error:\n" + now + "\n" + e.toString() + "\n";
    fs.appendFile('error_log.txt', error_text, function(err) {});
  }
});


app.get('/getCurrentImageReference', async (req, res) => {
  try {
    // Scan the DynamoDB table for the first approved image
    const params = {
      TableName: DYNAMODB_TABLE_NAME,
      FilterExpression: "approved = :approved",
      ExpressionAttributeValues: {
        ":approved": true
      },
      Limit: 1  // Retrieve only the first approved image
    };

    const data = await dynamoDB.scan(params).promise();

    if (data.Items.length === 0) {
      return res.json({ error: 'No approved image found' });
    }

    const item = data.Items[0]; // Get the first item

    const s3ObjectParams = {
      Bucket: S3_BUCKET_NAME,
      Key: item.id.concat('.png')  // Use the appropriate file extension
    };

    // Fetch the image from S3
    const s3Data = await s3.getObject(s3ObjectParams).promise();
    const imageData = s3Data.Body.toString('base64');  // Convert image to base64

    // Return the image data and prompt
    return res.json({
      imageData: imageData,
      prompt: item.prompt,
      modelId: item.modelId,
      modelname: item.modelname
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    return res.json({ error: 'Failed to fetch image data' });
  }
});


app.get('/getCurrentImageReference', async (req, res) => {
  const id = req.query.id;
  if (!id) {
      return res.json({ error: 'ID is required' });
  }

  try {
      const params = {
          TableName: galleryTableName,
          Key: { id: id }
      };

      const data = await dynamoDB.get(params).promise();
      if (!data.Item) {
          return res.json({ error: 'Image not found' });
      }

      const s3ObjectParams = {
          Bucket: 'reinvent-generativeart-galleryv2',
          Key: `${id}.png`
      };

      const s3Data = await s3.getObject(s3ObjectParams).promise();
      const imageData = s3Data.Body.toString('base64');

      return res.json({
          imageData: imageData,
          prompt: data.Item.prompt
      });
  } catch (error) {
      console.error('Error fetching image:', error);
      return res.json({ error: 'Failed to fetch image data' });
  }
});


server.listen(port, '0.0.0.0');

// Set up the socket.io server for real-time connections from the web client
const { Server } = require("socket.io");
const io = new Server(server, { maxHttpBufferSize: 1e8 });
console.log("Server on!");
table_writer.init();

function send_response(msg, socket) {
  socket.emit("update", msg);
}

// Listen for new connections from the web client, and set up listeners
io.on('connection', function(socket) {
  try {
    console.log("New app connected.");

    // Fetch unapproved records
    socket.on('fetchApproverPrompts', async () => {
      const prompts = await getUnapprovedRecords();
      socket.emit('getUnapprovedRecords', prompts);
    });

    // Approve selected prompts
    socket.on('approvePrompt', async (ids) => {
      await approvePrompts(ids);
      const prompts = await getUnapprovedRecords();
      socket.emit('getUnapprovedRecords', prompts); // Emit updated list
    });

    // Deny selected prompts
    socket.on('denyPrompt', async (ids) => {
      await denyPrompt(ids);
      const prompts = await getUnapprovedRecords();
      socket.emit('getUnapprovedRecords', prompts); // Emit updated list
    });

    // Handle prompt submission for execution in the web client
    socket.on("prompt", async (message, llmid) => {
      await call_Bedrock(message, llmid, socket);
    });

  // Handle image submission for the contest
  socket.on("uploadimage", async (uploadParams) => {
    try {
        const s3filekey = await upload_image(uploadParams);
        const orderNumber = await table_writer.record_submission(uploadParams, s3filekey);
        
        // Refresh the unapproved prompts for the approver
        const updatedPrompts = await getUnapprovedRecords();
        io.emit('getUnapprovedRecords', updatedPrompts);
        
        socket.emit("uploadresult", {
            "success": true,
            "orderNumber": orderNumber
        });
    } catch (error) {
        console.error('Upload error:', error);
        socket.emit("uploadresult", {
            "success": false,
            "error": error.message
        });
    }
  });

    // Fetch existing images for 360-degree view
    socket.on('fetchImagePaths', async () => {
      try {
        const images = await updateCarousel();
        const imageData = await create360Panorama(images);
        socket.emit('updateViewer', imageData);
      } catch (error) {
        console.error('Error fetching images:', error);
        socket.emit('error', 'Failed to fetch images');
      }
    });



    socket.on('viewImage', async (id) => {
      try {
          const params = {
              TableName: DYNAMODB_TABLE_NAME,  // Use the constant defined at the top
              Key: { id: id }
          };
          const data = await dynamoDB.get(params).promise();
          
          if (!data.Item) {
              socket.emit('imageData', { error: 'Image not found' });
              return;
          }
  
          const s3ObjectParams = {
              Bucket: S3_BUCKET_NAME,  // Use the constant defined at the top
              Key: `${id}.png`
          };
  
          const s3Data = await s3.getObject(s3ObjectParams).promise();
          const imageData = s3Data.Body.toString('base64');
          
          socket.emit('imageData', {
              imageData: imageData,
              prompt: data.Item.prompt
          });
      } catch (error) {
          console.error('Error fetching image:', error);
          socket.emit('imageData', { error: 'Failed to fetch image data' });
      }
  });


  } catch (e) {
    console.log(e);
    var now = new Date().toJSON().slice(0, 10).replace(/-/g, '/');
    var error_text = "HTTPS socket.io error:\n" + now + "\n" + e.toString() + '\n';
    fs.appendFile('error_log.txt', error_text, function(err) {});
  }
});




// Function to create 360 panorama using Stability AI or another model
async function create360Panorama(images) {
  try {
    const prompt = generatePromptFromImages(images);
    const response = await invoke_bedrock(prompt, "Stable Diffusion");
    const textDecoder = new TextDecoder('utf-8');
    const jsonString = textDecoder.decode(response.body.buffer);
    const parsedData = JSON.parse(jsonString);
    return parsedData.artifacts[0].base64.trim();
  } catch (e) {
    console.error("Error generating 360-degree image:", e);
    throw e;
  }
}


// New endpoint to fetch image data using order number from counter.txt
app.get('/getImageFromCounter', async (req, res) => {
  try {
    const counterFilePath = path.join(__dirname, 'counter.txt');
    const orderNumberContent = fs.readFileSync(counterFilePath, 'utf8').trim();

    // Ensure the order number is numeric
    const orderNumber = parseInt(orderNumberContent, 10);
    if (isNaN(orderNumber)) {
      console.error('Invalid order number in counter.txt:', orderNumberContent);
      return res.json({ error: 'Invalid order number in counter.txt' });
    }

    // Fetch image details using the order number
    const params = {
      TableName: DYNAMODB_TABLE_NAME,
      FilterExpression: 'orderNumber = :orderNumber and approved = :approved',
      ExpressionAttributeValues: { ':orderNumber': orderNumber, ':approved': true }
    };

    const data = await dynamoDB.scan(params).promise();

    if (data.Items.length === 0) {
      return res.json({ error: 'No image found for the provided order number' });
    }

    const item = data.Items[0];
    const s3ObjectParams = { Bucket: S3_BUCKET_NAME, Key: item.id.concat('.png') };
    const s3Data = await s3.getObject(s3ObjectParams).promise();
    const imageData = s3Data.Body.toString('base64');

    res.json({ imageData: imageData, prompt: item.prompt });
  } catch (error) {
    console.error('Error fetching image data:', error);
    res.json({ error: 'Failed to retrieve image data' });
  }
});



// Function to generate a prompt from images
function generatePromptFromImages(images) {
  return "A beautiful 360-degree panorama based on the following images: " + images.map(img => img.prompt).join(", ");
}

// Runs the prompt via Bedrock, and emits the result back to the client
async function call_Bedrock(prompt, llmid, socket) {
  try {
    var status = "bedrock_error";
    var response = await invoke_bedrock(prompt, llmid);
    const textDecoder = new TextDecoder('utf-8');
    const jsonString = textDecoder.decode(response.body.buffer);
    const parsedData = JSON.parse(jsonString);
    if (llmid == "Stable Diffusion") {
      response = parsedData.artifacts[0].base64.trim();
    } else {
      response = parsedData.images[0].trim();
    }
    status = "bedrock_success";
    send_response([status, response], socket);
  } catch (e) {
    console.log("Error in calling Bedrock:");
    console.log(e);
    send_response(["error", e], socket);
  }
}

// Utility function to serve static files
function serveFile(filename, response, contentTypesByExtension = {}) {
  fs.exists(filename, function (exists) {
      if (!exists) {
          response.writeHead(404, { "Content-Type": "text/plain" });
          response.write("404 Not Found\n");
          response.end();
          return;
      }

      fs.readFile(filename, "binary", function (err, file) {
          if (err) {
              response.writeHead(500, { "Content-Type": "text/plain" });
              response.write(err + "\n");
              response.end();
              return;
          }

          const headers = {};
          const contentType = contentTypesByExtension[path.extname(filename)];
          if (contentType) headers["Content-Type"] = contentType;
          response.writeHead(200, headers);
          response.write(file, "binary");
          response.end();
      });
  });
}

// Initial delay of 5 seconds, then schedule the function to run every 45 seconds
setTimeout(async () => {
  const imagesCarousel = await updateCarousel();
  io.emit('updateCarousel', imagesCarousel);

  setInterval(async () => {
    const imagesCarousel = await updateCarousel();
    io.emit('updateCarousel', imagesCarousel);
  }, 200000);
}, 15000);

