const samplePrompts = new Map([
  ['Create my own', ''],
  ['Nature time', 'Oil painting of a cottage'],
  ['Lets go Paris', 'A photorealistic render of the Eiffel Tower']
]);

$(document).ready(() => {
  const socket = io(); // Web socket to connect to the backend
  let base64EncodedResultImage = '';
  let currentOrderNumber = null; // Store order number after image generation

  // Update the prompt input field on sample prompt selection
  $('#bedrock-models li').on('click', function () {
    const selectedPrompt = $(this).text();
    $('#sample_button').text(selectedPrompt);
  });

  // Clear the prompt input field
  $('#clear_button').on('click', () => {
    $('#prompt').val('');
  });

  // Send the prompt to the backend via web socket
  $('#run_button').on('click', () => {
    setImageGenerationInProgress(true);

    const llmId = $('#sample_button').text();
    const prompt = $('#prompt').val().trim();

    socket.emit('prompt', prompt, llmId);
  });

  // Handle form submission for uploading an image
  $("#uploadform").on("submit", function (event) {
    event.preventDefault();

    // Validate required fields
    const model = $("#sample_button").text();
    const prompt = $("#prompt").val().trim();

    if (model === 'Choose LLM') {
        $("#uploadresult").text("Please select a model first");
        return;
    }

    if (!prompt) {
        $("#uploadresult").text("Please enter a prompt");
        return;
    }

    if (!base64EncodedResultImage) {
        $("#uploadresult").text("Please generate an image first");
        return;
    }

    setFileUploadInProgress(true);

    const uploadParams = {
        model,
        prompt,
        imagebase64: base64EncodedResultImage
    };

    socket.emit("uploadimage", uploadParams);
});


  // Handle Bedrock execution response
  socket.on('update', async function (message) {
    setImageGenerationInProgress(false);

    if (message[0] === 'bedrock_success') {
        base64EncodedResultImage = message[1];
        $('#gen_imagebox').removeAttr('hidden');
        $('#genimage').attr('src', `data:image/jpg;base64,${base64EncodedResultImage}`);

        try {
            // Fetch the latest `orderNumber` from the backend
            const response = await fetch('/api/getOrderNumber', { method: 'GET' });
            const data = await response.json();

            if (response.ok && data.orderNumber) {
                const orderNumber = data.orderNumber;

                // Display the order number in the modal
                const orderModalContent = `Your order number is ${orderNumber}. Use it to access your image later.`;
                $('#infoModalBody').text(orderModalContent);
                const infoModal = new bootstrap.Modal(document.getElementById('infoModal'));
                infoModal.show();
            } else {
                console.error('Failed to fetch order number:', data.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Error fetching order number:', error);
        }
    } else {
        const errorMessage = message[1].includes('(ThrottlingException)')
            ? 'Server is busy, please wait before trying again.'
            : 'Sorry, something went wrong. Please wait before trying again.';
        alert(errorMessage);
    }
  });


  // Handle submission result response
  socket.on("uploadresult", (response) => {
    if (response.success) {
        $("#uploadresult").text("Thank you, your entry has been submitted.");
        
        if (response.orderNumber) {
            // First show the alert with order number
            alert(`Your order number is: ${response.orderNumber}\nPlease save this number to view your image in VR later!`);
            
            const vrUrl = `${window.location.origin}/360?orderNumber=${response.orderNumber}`;
            
            // Store order number
            localStorage.setItem('currentOrderNumber', response.orderNumber);
            
            // Reset form elements
            $("#prompt").val('');
            $('#sample_button').text('Choose LLM');
            $('#selected-llm').text('Choose LLM');
            
            // Reset example prompts dropdown to default
            $('#example_prompts').val('');
            
            // Reset image space
            $('#gen_imagebox').attr('hidden', true);
            $('#genimage').attr('src', '');
            
            // Scroll to top of page
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    } else {
        $('#uploadresult').text('Sorry, submission failed, please retry.');
    }
    setFileUploadInProgress(false);
  });


  // VR button click event
  $('#vr_button').on('click', async function () {
    try {
        const response = await fetch('/api/getOrderNumber', { method: 'GET' });
        const data = await response.json();

        if (response.ok && data.orderNumber) {
            alert(`Your order number is: ${data.orderNumber}. Use this number to view your image in VR.`);
        } else {
            alert('Failed to retrieve the order number. Please try again.');
        }
    } catch (error) {
        console.error('Error fetching order number:', error);
        alert('Failed to retrieve the order number. Please try again.');
    }
  });

});

// Utility function: Set image generation progress state
function setImageGenerationInProgress(inProgress) {
  $('#run_button_spinner').prop('hidden', !inProgress);
  $('#run_button_icon').prop('hidden', inProgress);
  $('#run_button').prop('disabled', inProgress);
  $('#prompt').prop('disabled', inProgress);
  $('#clear_button').prop('disabled', inProgress);

  if (inProgress) {
    $('#uploadresult').text('');
  }
}

// Utility function: Set file upload progress state
function setFileUploadInProgress(inProgress) {
  $('#upload_button_spinner').prop('hidden', !inProgress);
  $('#upload_button_icon').prop('hidden', inProgress);
  $('#upload_button').prop('disabled', inProgress);
}
