const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const tableName = 'reinvent-generativeart-gallery';
const counterTableName = 'reinvent-generativeart-gallery-counter';
const bucketName = 'reinvent-generativeart-galleryv2';
const sharp = require('sharp');

// Initialize counter if it doesn't exist
// Initialize counter with starting value of 1000
async function initializeCounter() {
    try {
        await dynamoDB.put({
            TableName: counterTableName,
            Item: {
                'id': 'counter',
                'orderNumber': 1000  // Start from 1000
            },
            ConditionExpression: 'attribute_not_exists(id)'
        }).promise();
    } catch (error) {
        if (error.code !== 'ConditionalCheckFailedException') {
            console.error('Error initializing counter:', error);
            throw error;
        }
    }
}

// Get next order number using atomic counter
async function getNextOrderNumber() {
    const params = {
        TableName: counterTableName,
        Key: { 'id': 'counter' },
        UpdateExpression: 'SET orderNumber = if_not_exists(orderNumber, :start) + :incr',
        ExpressionAttributeValues: {
            ':start': 1000,  // Initialize to 1000 if not exists
            ':incr': 1
        },
        ReturnValues: 'UPDATED_NEW'
    };

    try {
        const result = await dynamoDB.update(params).promise();
        return result.Attributes.orderNumber;
    } catch (error) {
        if (error.code === 'ResourceNotFoundException') {
            await initializeCounter();
            return getNextOrderNumber();
        }
        console.error('Error updating counter:', error);
        throw error;
    }
}

// Get next order number using atomic counter
async function getNextOrderNumber() {
    const params = {
        TableName: counterTableName,
        Key: { 'id': 'counter' },
        UpdateExpression: 'SET orderNumber = orderNumber + :incr',
        ExpressionAttributeValues: {
            ':incr': 1
        },
        ReturnValues: 'UPDATED_NEW'
    };

    try {
        const result = await dynamoDB.update(params).promise();
        return result.Attributes.orderNumber;
    } catch (error) {
        if (error.code === 'ResourceNotFoundException') {
            await initializeCounter();
            return getNextOrderNumber();
        }
        console.error('Error updating counter:', error);
        throw error;
    }
}

async function update360(orderNumber) {
    if (!orderNumber) {
        return { error: 'Order number is required' };
    }

    try {
        const numericOrderNumber = parseInt(orderNumber, 10);
        const params = {
            TableName: tableName,
            IndexName: 'orderNumber-index', // Add a GSI for better performance
            KeyConditionExpression: 'orderNumber = :orderNumber',
            FilterExpression: 'approved = :approved',
            ExpressionAttributeValues: { 
                ':approved': true,
                ':orderNumber': numericOrderNumber
            }
        };

        const data = await dynamoDB.query(params).promise(); // Using query instead of scan
        if (data.Items.length === 0) {
            return { error: 'No image found for the provided order number' };
        }

        const item = data.Items[0];
        
        // Get image from S3 with error handling
        try {
            const s3ObjectParams = {
                Bucket: bucketName,
                Key: `${item.id}.png`
            };

            const s3Data = await s3.getObject(s3ObjectParams).promise();
            
            // Enhance image quality with error handling
            const enhancedImage = await sharp(s3Data.Body)
                .resize(2048, 2048, {
                    kernel: sharp.kernel.lanczos3,
                    fit: 'fill'
                })
                .sharpen({
                    sigma: 1.5,
                    m1: 1.5,
                    m2: 0.7
                })
                .toBuffer();

            const imageData = enhancedImage.toString('base64');

            return {
                imageData: imageData,
                prompt: item.prompt,
                orderNumber: item.orderNumber
            };
        } catch (s3Error) {
            console.error('Error processing S3 image:', s3Error);
            return { error: 'Failed to process image' };
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        return { error: 'Failed to retrieve data' };
    }
}

// Initialize counter on module load
(async () => {
    try {
        await initializeCounter();
        console.log('Counter initialized successfully');
    } catch (error) {
        console.error('Failed to initialize counter:', error);
    }
})();

module.exports = { 
    update360, 
    getNextOrderNumber 
};