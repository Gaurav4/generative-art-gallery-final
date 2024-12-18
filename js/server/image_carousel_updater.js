const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const tableName = 'reinvent-generativeart-gallery'; // Replace with your actual table name
const bucketName = 'reinvent-generativeart-galleryv2'; // Ensure this environment variable is set

async function updateCarousel() {
    try {
        const params = {
            TableName: tableName,
            FilterExpression: "approved = :approved",
            ExpressionAttributeValues: { ":approved": true }
        };

        const data = await dynamoDB.scan(params).promise();

        // Sort items by 'sortKey' in descending order and limit to top 100
        const sortedItems = data.Items.sort((a, b) => b.sortkey.localeCompare(a.sortkey)).slice(0, 100);

        const images = await Promise.all(sortedItems.map(async item => {
            const s3ObjectParams = {
                Bucket: bucketName,
                Key: item.id.concat('.png')
            };

            try {
                const s3Data = await s3.getObject(s3ObjectParams).promise();
                return {
                    id: item.id,
                    modelId: item.modelId,
                    modelname: item.modelname,
                    prompt: item.prompt,
                    s3filepath: item.s3filepath,
                    imageData: s3Data.Body.toString('base64'), // Convert image to base64
                    sortkey: item.sortkey,
                };
            } catch (s3Error) {
                console.error(`Error fetching image from S3 for ${item.s3filepath}:`, s3Error);
                return null;
            }
        }));

        return images.filter(image => image !== null);
    } catch (error) {
        console.error('Error fetching data from DynamoDB:', error);
        return [];
    }
}


module.exports = updateCarousel;


