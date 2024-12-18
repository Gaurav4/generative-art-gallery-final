const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const tableName = 'reinvent-generativeart-galleryv2'; // Replace with your actual table name

async function update360(orderNumber) {
    if (!orderNumber) {
        return { error: 'Order number is required' };
    }

    try {
        // Query DynamoDB based on the provided order number
        const params = {
            TableName: tableName,
            FilterExpression: "approved = :approved and orderNumber = :orderNumber",
            ExpressionAttributeValues: { 
                ":approved": true,
                ":orderNumber": orderNumber  // Ensure this matches the attribute type in your DynamoDB table
            }
        };

        const data = await dynamoDB.scan(params).promise();

        if (data.Items.length === 0) {
            return { error: 'No image found for the provided order number' };
        }

        // Return the s3filepath URL directly to be used in the frontend
        const item = data.Items[0];
        return {
            id: item.id,
            modelId: item.modelId,
            modelname: item.modelname,
            prompt: item.prompt,
            s3filepath: item.s3filepath,  // Pass this directly for rendering in the 360 viewer
            sortkey: item.sortkey,
        };
    } catch (error) {
        console.error('Error fetching data from DynamoDB:', error);
        return { error: 'Failed to retrieve data from DynamoDB' };
    }
}

module.exports = update360;

