/*
This is a client to invoke Bedrock's Stable Diffusion model.
*/

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const BedrockLlm = new Map([
  ["Nova Canvas", "amazon.nova-canvas-v1:0"],
  ["Stable Diffusion", "stability.stable-diffusion-xl-v1"],
  ["Amazon Titan", "amazon.titan-image-generator-v1"],
  ["Amazon Titan V2", "amazon.titan-image-generator-v2:0"],
  ["Stable Diffusion 3 Large", "stability.sd3-large-v1:0"],
  ["Stable Image Ultra", "stability.stable-image-ultra-v1:0"],
  ["Stable Image Core", "stability.stable-image-core-v1:0"],
  ["Fine-tuned Model", "arn:aws:bedrock:us-west-2:253490758946:provisioned-model/u66tkilspp3x"],
]);

var region = process.env.region;

const invoke_bedrock = async (prompt, llmid) => {
  var rand_seed = generate_random_seed(0, 4294967295);
  var modelId = BedrockLlm.get(llmid);

  // Override the region for "amazon.nova-canvas-v1:0"
  if (modelId === "amazon.nova-canvas-v1:0") {
    region = "us-east-1";
  }
  else {
    region = process.env.region;
  }

  var body = model_options(modelId, prompt, rand_seed);
  console.log(body);

  const params = {
    contentType: "application/json",
    accept: "*/*",
    modelId: modelId,
    body: body,
  };

  const client = new BedrockRuntimeClient({ region: region });

  try {
    const command = new InvokeModelCommand(params);
    const bedrock_response = await client.send(command);
    return bedrock_response;
  } catch (e) {
    throw e;
  }
};

function model_options(modelId, prompt, rand_seed) {
  if (modelId === "stability.stable-diffusion-xl-v1") {
    return `{
      "text_prompts":[
          {
              "text":"${prompt}"
          }],
      "cfg_scale":10,
      "seed":${rand_seed},
      "steps":50
    }`;
  } 
  else if(modelId == ('stability.sd3-large-v1:0') || modelId == 'stability.stable-image-core-v1:0' || modelId == 'stability.stable-image-ultra-v1:0'){
    return JSON.stringify({
      prompt: prompt
    }) 
  } else if (modelId === "amazon.nova-canvas-v1:0") {
    return JSON.stringify({
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: prompt,
      },
      imageGenerationConfig: {
        numberOfImages: 1,
        height: 1024,
        width: 1024,
        cfgScale: 8.0,
        seed: 0,
      },
    });
  } else {
    return JSON.stringify({
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: prompt,
      },
      imageGenerationConfig: {
        numberOfImages: 1,
        quality: "premium",
        height: 768,
        width: 1280,
        cfgScale: 7.5,
        seed: 42,
      },
    });
  }
}

function generate_random_seed(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

module.exports = invoke_bedrock;
