const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const upload_image = require('./file_uploader');
const invoke_bedrock = require('./bedrock_client');

const galleryTableName = 'reinvent-generativeart-gallery';
const counterFilePath = path.join(__dirname, 'counter.txt'); // Path to counter.txt

async function getUnapprovedRecords() {
    try {
        const params = {
            TableName: galleryTableName,
            FilterExpression: "approved = :approved",
            ExpressionAttributeValues: { ":approved": false },
            ProjectionExpression: "id, orderNumber, approved, prompt, s3filepath" // Fetch orderNumber too
        };

        const data = await dynamoDB.scan(params).promise();
        console.log('Data from DynamoDB:', data); // Debug logging
        return data.Items;
    } catch (error) {
        console.error('Error fetching data from DynamoDB:', error);
        return [];
    }
}

async function call_Bedrock(prompt, llmid) {
    try {
        const formattedPrompt = {
            prompt: prompt,
            seed: Math.floor(Math.random() * 1000000)
        };

        const response = await invoke_bedrock(formattedPrompt, llmid);
        const textDecoder = new TextDecoder('utf-8');
        const jsonString = textDecoder.decode(response.body.buffer);
        const parsedData = JSON.parse(jsonString);

        return parsedData.artifacts[0].base64.trim();
    } catch (e) {
        console.error("Error generating image with Bedrock:", e);
        throw e;
    }
}

async function approvePrompts(ids) {
    try {
        const getItemPromises = ids.map(id => dynamoDB.get({
            TableName: galleryTableName,
            Key: { id }
        }).promise());

        const items = await Promise.all(getItemPromises);

        const updatedItems = await Promise.all(items.map(async item => {
            const imageBase64 = await call_Bedrock(item.Item.prompt, "Stable Diffusion");
            const s3Uri = await upload_image({ imagebase64: imageBase64 });
            item.Item.s3filepath = s3Uri;
            return item.Item;
        }));

        const updatePromises = ids.map(id => dynamoDB.update({
            TableName: galleryTableName,
            Key: { id },
            UpdateExpression: "set approved = :approved, s3filepath = :s3filepath",
            ExpressionAttributeValues: { 
                ":approved": true,
                ":s3filepath": updatedItems.find(item => item.id === id).s3filepath
            }
        }).promise());

        await Promise.all(updatePromises);
        console.log('Approved items updated to true in gallery table');

        // Write the order number of the last approved item to counter.txt
        const lastApprovedItem = updatedItems[updatedItems.length - 1];
        if (lastApprovedItem && lastApprovedItem.orderNumber) {
            fs.writeFileSync(counterFilePath, lastApprovedItem.orderNumber.toString(), 'utf8');
            console.log(`Counter updated to order number: ${lastApprovedItem.orderNumber}`);
        }
    } catch (error) {
        console.error('Error approving items:', error);
    }
}

async function denyPrompt(ids) {
    try {
        const updatePromises = ids.map(id => dynamoDB.update({
            TableName: galleryTableName,
            Key: { id },
            UpdateExpression: "set approved = :approved",
            ExpressionAttributeValues: { 
                ":approved": "denied"
            }
        }).promise());

        await Promise.all(updatePromises);
        console.log('Denied items updated to "denied" in gallery table');
    } catch (error) {
        console.error('Error denying items:', error);
    }
}

module.exports = { getUnapprovedRecords, approvePrompts, denyPrompt };

