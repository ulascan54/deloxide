/**
 * Deloxide - Deadlock Detection Visualization
 *
 * This file contains the main JavaScript code for the deadlock detection
 * visualization tool. It manages the D3.js visualization, UI interactions,
 * and animation controls.
 */

// Global variables for visualization
let logData = []
let graphStateData = []
let currentStep = 1
let nodes = []
let links = []
let svg, linkGroup, nodeGroup, tooltip, simulation
let currentScenario = null
let animationInterval = null
let isPlaying = false
let isFileUploaded = false // Add flag to track if data was uploaded
let animationSpeed = 1.0 // Default animation speed (1.0 = normal speed)
let buttonCooldown = false // Add variable to track button cooldown status

// Theme management
const themeToggle = document.getElementById("theme-toggle")
const themeIcon = document.getElementById("theme-icon")
const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)")

// Check for saved theme preference or use the system preference
const getCurrentTheme = () => {
  const savedTheme = localStorage.getItem("theme")
  if (savedTheme) {
    return savedTheme
  }
  return prefersDarkScheme.matches ? "dark" : "light"
}

// Apply the current theme
const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme)

  if (themeIcon) {
    if (theme === "dark") {
      themeIcon.className = "fas fa-sun"
      themeToggle.setAttribute("aria-label", "Switch to light mode")
      themeToggle.querySelector("span").textContent = "Light Mode"
    } else {
      themeIcon.className = "fas fa-moon"
      themeToggle.setAttribute("aria-label", "Switch to dark mode")
      themeToggle.querySelector("span").textContent = "Dark Mode"
    }
  }
}

// Toggle between light and dark themes
const toggleTheme = () => {
  const currentTheme = getCurrentTheme()
  const newTheme = currentTheme === "light" ? "dark" : "light"

  localStorage.setItem("theme", newTheme)
  applyTheme(newTheme)
}

// Upload functionality
const initUploadFeature = () => {
  const uploadBtn = document.getElementById("upload-btn")
  const uploadModal = document.getElementById("upload-modal")
  const closeBtn = uploadModal.querySelector(".modal-close")
  const dropArea = document.getElementById("drop-area")
  const fileInput = document.getElementById("file-input")
  const fileSelectBtn = document.getElementById("file-select-btn")
  const uploadList = document.getElementById("upload-list")
  const jsonPreview = document.getElementById("json-preview")
  const jsonContent = document.getElementById("json-content")
  const shareBtn = document.getElementById("share-btn")

  // Share functionality
  if (shareBtn) {
    shareBtn.addEventListener("click", openShareModal)
  }

  // Open modal when upload button is clicked
  uploadBtn.addEventListener("click", () => {
    showModalWithAnimation(uploadModal);
  })

  // Close modal
  closeBtn.addEventListener("click", () => {
    hideModalWithAnimation(uploadModal);
  })

  // Close modal when clicking outside
  window.addEventListener("click", (e) => {
    if (e.target === uploadModal) {
      hideModalWithAnimation(uploadModal);
    }
  })

  // Open file dialog when button is clicked
  fileSelectBtn.addEventListener("click", () => {
    fileInput.click()
  })

  // Handle file selection
  fileInput.addEventListener("change", () => {
    handleFiles(fileInput.files)
  })

  // Prevent default drag behaviors
  ;["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, preventDefaults, false)
  })

  function preventDefaults(e) {
    e.preventDefault()
    e.stopPropagation()
  }

  // Highlight drop area when dragging over it
  ;["dragenter", "dragover"].forEach((eventName) => {
    dropArea.addEventListener(eventName, highlight, false)
  })
  ;["dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, unhighlight, false)
  })

  function highlight() {
    dropArea.classList.add("highlight")
  }

  function unhighlight() {
    dropArea.classList.remove("highlight")
  }

  // Handle dropped files
  dropArea.addEventListener("drop", (e) => {
    const dt = e.dataTransfer
    const files = dt.files
    handleFiles(files)
  })

  // Process the files
  function handleFiles(files) {
    // Convert FileList to array for easier handling
    const filesArray = Array.from(files)
    
    // Clear previous uploads
    uploadList.innerHTML = ""
    
    // Only process the first file
    if (filesArray.length > 0) {
      const file = filesArray[0]
      
      // Show in upload list
      const fileItem = document.createElement("div")
      fileItem.className = "upload-item"

      const fileName = document.createElement("span")
      fileName.className = "upload-item-name"
      fileName.textContent = file.name

      const fileSize = document.createElement("span")
      fileSize.className = "upload-item-size"
      fileSize.textContent = formatFileSize(file.size)
      
      // Add file info to the upload list
      fileItem.appendChild(fileName)
      fileItem.appendChild(fileSize)
      uploadList.appendChild(fileItem)
      
      // Hide the preview area
      jsonPreview.style.display = "none"
      
      // Automatically load the file without requiring the user to click the load button
      loadScenarioFromFile(file)
    }
  }

  // Format file size for display
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " bytes"
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
    else return (bytes / 1048576).toFixed(1) + " MB"
  }

  // Read and show JSON content
  function readAndPreviewJSON(file) {
    const reader = new FileReader()

    reader.onload = function (e) {
      try {
        // Check if the file is a newline-delimited JSON format
        const content = e.target.result
        let jsonData
        let isNewFormat = false

        if (content.trim().startsWith("{") && content.includes('{"event":')) {
          // This is likely the new format with one JSON per line
          isNewFormat = true
          // Just show the raw text for preview
          jsonContent.textContent = content
        } else {
          // Assume it's a standard JSON file
          jsonData = JSON.parse(content)
          const formattedJSON = JSON.stringify(jsonData, null, 2)
          jsonContent.textContent = formattedJSON
        }

        jsonPreview.style.display = "block"

        // Validate if this is a proper deadlock log
        if (!isNewFormat && validateDeadlockLog(jsonData)) {
          console.log("Valid deadlock log file loaded")
        } else if (isNewFormat) {
          console.log("New format log file detected")
        } else {
          console.warn(
            "The uploaded file does not appear to be a valid deadlock log"
          )
          showToast(
            "Warning: The file does not appear to be a valid deadlock log file. It may not display correctly.",
            "warning"
          )
        }
      } catch (error) {
        jsonContent.textContent = "Error parsing JSON: " + error.message
        jsonPreview.style.display = "block"
      }
    }

    reader.onerror = function () {
      jsonContent.textContent = "Error reading file"
      jsonPreview.style.display = "block"
    }

    reader.readAsText(file)
  }

  // Load scenario from uploaded file
  function loadScenarioFromFile(file) {
    const reader = new FileReader()

    reader.onload = function (e) {
      try {
        // Get file content
        const content = e.target.result
        let scenario

        // Set the uploaded flag to true
        isFileUploaded = true

        // Stop any ongoing animation
        if (isPlaying) {
          clearInterval(animationInterval)
          isPlaying = false
          const playBtn = document.getElementById("play-btn")
          playBtn.querySelector("span").textContent = "Play Animation"
          playBtn.querySelector("i").className = "fas fa-play"
        }

        // Check if this is the new format (one JSON object per line)
        if (content.trim().startsWith("{") && content.includes('{"event":')) {
          try {
            // Process the new format logs - one JSON per line
            scenario = processNewFormatLogs(content)

            // Store the original content for sharing
            scenario.rawContent = content

            // Process the transformed data
            uploadModal.style.display = "none"
            resetVisualization()
            currentScenario = scenario
            logData = scenario.logs
            graphStateData = scenario.graph_state

            // Show loading state
            document.getElementById("loading").style.display = "block"
            document.getElementById("loading").innerHTML =
              '<div class="spinner"></div><p>Loading visualization...</p>'

            // Show share button for uploads
            if (shareBtn) {
              shareBtn.style.display = "flex"
            }

            // Initialize visualization after a brief delay
            setTimeout(() => {
              initVisualization()

              // Hide loading message and show visualization elements
              showVisualizationElements()

              // Initialize timeline
              initTimeline()

              // Update visualization for the first step
              updateVisualization()

              // Auto-start removed - user needs to click play manually
            }, 100)
          } catch (lineFormatError) {
            console.error("Error processing line-by-line JSON:", lineFormatError)
            showToast("Error processing log file: " + lineFormatError.message, "error")
          }
        } else {
          // Handle standard JSON formats
          try {
            // Parse the uploaded file as standard JSON
            const jsonData = JSON.parse(content)

            // Check if this is the new format (raw data array)
            if (
              Array.isArray(jsonData) &&
              jsonData.length >= 1 &&
              Array.isArray(jsonData[0])
            ) {
              // This is the new raw format, transform it using the utility function
              scenario = transformRawObject(jsonData)

              // Store the original raw data for sharing
              scenario.rawData = jsonData

              // Process the transformed data
              uploadModal.style.display = "none"
              resetVisualization()
              currentScenario = scenario
              logData = scenario.logs
              graphStateData = scenario.graph_state

              // Show loading state
              document.getElementById("loading").style.display = "block"
              document.getElementById("loading").innerHTML =
                '<div class="spinner"></div><p>Loading visualization...</p>'

              // Show share button for uploads
              if (shareBtn) {
                shareBtn.style.display = "flex"
              }

              // Initialize visualization after a brief delay
              setTimeout(() => {
                initVisualization()

                // Hide loading message and show visualization elements
                showVisualizationElements()

                // Initialize timeline
                initTimeline()

                // Update visualization for the first step
                updateVisualization()

                // Auto-start removed - user needs to click play manually
              }, 100)
            } else {
              // Check if it's a standard format
              if (validateDeadlockLog(jsonData)) {
                // Process the scenario data (old format)
                uploadModal.style.display = "none"
                resetVisualization()
                currentScenario = jsonData
                logData = jsonData.logs
                graphStateData = jsonData.graph_state

                // Update scenario information
                updateScenarioInfo(jsonData)

                // Initialize visualization
                currentStep = 1

                // Show loading state while we initialize
                document.getElementById("loading").style.display = "block"
                document.getElementById("loading").innerHTML =
                  '<div class="spinner"></div><p>Loading visualization...</p>'

                // Show share button since we have data loaded
                if (shareBtn) {
                  shareBtn.style.display = "flex"
                }

                // Initialize after a brief delay to allow the UI to update
                setTimeout(() => {
                  initVisualization()

                  // Hide loading message and show visualization elements
                  showVisualizationElements()

                  // Initialize timeline
                  initTimeline()

                  // Update visualization for the first step
                  updateVisualization()

                  // Auto-start removed - user needs to click play manually
                }, 100)
              } else {
                showToast("Error: The file is not a valid deadlock log file. Please upload a properly formatted file.", "error")
              }
            }
          } catch (jsonError) {
            console.error("Error parsing JSON:", jsonError)
            showToast("Error loading file: " + jsonError.message, "error")
          }
        }
      } catch (error) {
        showToast("Error loading file: " + error.message, "error")
      }
    }

    reader.onerror = function () {
      showToast("Error reading file.", "error")
    }

    reader.readAsText(file)
  }
}

/**
 * Decode logs from a URL-safe Base64, Gzip and MessagePack encoded string
 */
function decodeLogs(encodedStr) {
  var base64 = encodedStr.replace(/-/g, "+").replace(/_/g, "/")
  var binaryStr = atob(base64)
  var len = binaryStr.length
  var bytes = new Uint8Array(len)
  for (var i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  var decompressed = pako.ungzip(bytes)
  var logsData = msgpack.decode(decompressed)
  return logsData
}

// Share functionality
function initShareFeature() {
  const shareModal = document.getElementById("share-modal")
  const closeBtns = shareModal.querySelectorAll(".modal-close")
  const copyBtn = document.getElementById("copy-link-btn")
  const shareLinkInput = document.getElementById("share-link")
  const copyStatus = document.getElementById("copy-status")

  // Close modal when clicking the X button
  closeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      hideModalWithAnimation(shareModal)
      copyStatus.style.display = "none"
    })
  })

  // Close modal when clicking outside
  window.addEventListener("click", (e) => {
    if (e.target === shareModal) {
      hideModalWithAnimation(shareModal)
      copyStatus.style.display = "none"
    }
  })

  // Copy link to clipboard
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      // Select the text first
      shareLinkInput.select()

      // Try to use the modern Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
          .writeText(shareLinkInput.value)
          .then(() => {
            // Show success message
            showCopySuccess()
          })
          .catch((err) => {
            console.error("Could not copy text using Clipboard API:", err)
            // Fall back to execCommand
            fallbackCopy()
          })
      } else {
        // Fall back to execCommand for older browsers
        fallbackCopy()
      }
    })
  }

  function fallbackCopy() {
    try {
      const successful = document.execCommand("copy")
      if (successful) {
        showCopySuccess()
      } else {
        console.error("Fallback: Unable to copy")
        showToast("Unable to copy to clipboard. Please select the text and copy manually.", "error")
      }
    } catch (err) {
      console.error("Fallback: Unable to copy", err)
      showToast("Unable to copy to clipboard. Please select the text and copy manually.", "error")
    }
  }

  function showCopySuccess() {
    // Show success message
    copyStatus.style.display = "flex"

    // Hide after 3 seconds
    setTimeout(() => {
      copyStatus.style.display = "none"
    }, 3000)
  }

  // Check for shared scenario in the URL
  checkForSharedScenario()
}

// Open share modal and generate shareable link
function openShareModal() {
  const shareModal = document.getElementById("share-modal")
  const shareLinkInput = document.getElementById("share-link")

  if (!currentScenario) {
    showToast("No scenario is currently loaded. Please upload a scenario first.", "warning");
    return
  }

  try {
    console.log("Preparing to share scenario")

    // Get the current URL and its base part (without query parameters)
    const currentUrl = window.location.href;
    const baseUrl = currentUrl.split("?")[0];

    // Check if we loaded this scenario from an encoded URL
    if (currentUrl.includes('?logs=') || currentUrl.includes('?format=') || currentUrl.includes('?data=')) {
      // We're already viewing an encoded URL, just use the current URL without step parameter
      const shareUrl = currentUrl.split('&step=')[0]; // Remove step parameter if present
      console.log("Using current encoded URL for sharing");
      
      // Set the input value
      shareLinkInput.value = shareUrl;
      
      // Show the modal
      showModalWithAnimation(shareModal);
      return;
    }

    // Check if data can be shared as raw content (new line-by-line format)
    if (currentScenario.rawContent) {
      // We have the original raw text content available
      console.log("Using raw line-by-line format for sharing")

      // Line-by-line JSON may need special handling
      const isLineByLine = 
        typeof currentScenario.rawContent === 'string' && 
        currentScenario.rawContent.trim().startsWith("{") && 
        currentScenario.rawContent.includes('{"event":');
        
      if (isLineByLine) {
        // Direct line-by-line format - URL encode it for sharing
        const encodedContent = encodeURIComponent(currentScenario.rawContent);
        console.log("Line-by-line JSON format encoded, size:", encodedContent.length);
        
        // Generate URL with format parameter to indicate line-by-line
        const shareUrl = `${baseUrl}?format=line-by-line&logs=${encodedContent}`;
        
        // Set the input value - if it's too long, warn the user
        if (shareUrl.length > 8000) {
          console.warn("Warning: Generated URL is very long and may not work in all browsers");
          showToast("Warning: The generated URL is very long and may not work in all browsers. Consider using a file upload instead.", "warning");
        }
        
        shareLinkInput.value = shareUrl;
        
        // Show the modal
        showModalWithAnimation(shareModal);
        return;
      }
      
      // Handle standard JSON compression for non-line-by-line format
      const compressedData = LZString.compressToEncodedURIComponent(
        currentScenario.rawContent
      )
      console.log(
        "Compressed line format size:",
        compressedData.length,
        "bytes"
      )

      // Generate URL with the format parameter to indicate line-by-line
      const shareUrl = `${baseUrl}?format=line&logs=${compressedData}`

      console.log("Share URL generated, length:", shareUrl.length)

      // Set the input value
      shareLinkInput.value = shareUrl

      // Show the modal
      showModalWithAnimation(shareModal)
      return
    }

    // Check if data can be shared as raw logs (msgpack format)
    if (currentScenario.rawData) {
      // We have the original raw data available
      console.log("Using raw log data for sharing")

      // Convert to msgpack, compress with gzip, and encode to base64
      const msgpackData = msgpack.encode(currentScenario.rawData)
      const compressedData = pako.gzip(msgpackData)

      // Convert to base64 and make URL-safe
      let base64 = ""
      const bytes = new Uint8Array(compressedData)
      const len = bytes.byteLength
      for (let i = 0; i < len; i++) {
        base64 += String.fromCharCode(bytes[i])
      }
      const b64encoded = btoa(base64).replace(/\+/g, "-").replace(/\//g, "_")

      console.log("Compressed logs size:", b64encoded.length, "characters")

      // Generate URL with the logs parameter
      const shareUrl = `${baseUrl}?logs=${b64encoded}`

      console.log("Share URL generated, length:", shareUrl.length)

      // Set the input value
      shareLinkInput.value = shareUrl

      // Show the modal
      showModalWithAnimation(shareModal)
      return
    }

    // Fallback to using the processed scenario object (for uploaded files without raw content or data)
    console.log("Using processed scenario data for sharing")

    // Create a compressed version of the current scenario
    const scenarioString = JSON.stringify(currentScenario)
    console.log("Original data size:", scenarioString.length, "bytes")

    // Compress the data using LZString
    const compressedData = LZString.compressToEncodedURIComponent(scenarioString)
    console.log("Compressed data size:", compressedData.length, "bytes")

    // Generate the full URL with the compressed data using the logs parameter
    const shareUrl = `${baseUrl}?logs=${compressedData}`

    console.log("Share URL generated, length:", shareUrl.length)

    // Set the input value
    shareLinkInput.value = shareUrl

    // Show the modal
    showModalWithAnimation(shareModal)
  } catch (error) {
    console.error("Error generating share link:", error)
    showToast("Error generating share link: " + error.message, "error")
  }
}

// Check for shared scenario in URL parameters
function checkForSharedScenario() {
  const urlParams = new URLSearchParams(window.location.search)
  const encodedData = urlParams.get("data")
  const step = urlParams.get("step")
  const encodedLogs = urlParams.get("logs") || urlParams.get("log") // Support both 'logs' and 'log' parameters
  const format = urlParams.get("format") // New parameter to indicate line-by-line format

  // Handle encoded logs parameter
  if (encodedLogs) {
    try {
      console.log("Found logs parameter in URL, processing...")

      // Show loading state
      document.getElementById("loading").style.display = "block"
      document.getElementById("loading").innerHTML =
        '<div class="spinner"></div><p>Loading shared visualization...</p>'

      // Decode the encoded logs
      console.log("Decoding logs from URL parameter...")
      let decodedData;
      
      // Check if it's the line-by-line JSON format (already encoded in the URL)
      if (encodedLogs.trim().startsWith("{") && encodedLogs.includes('{"event":')) {
        console.log("Detected line-by-line JSON format");
        decodedData = encodedLogs;
      } else {
        try {
          // Try to parse as JSON first
          decodedData = JSON.parse(encodedLogs);
          console.log("Successfully parsed logs as JSON");
        } catch (e) {
          // If not valid JSON, try to decode from URL encoding or Base64
          try {
            // First try LZString decompression (for data shared from the app)
            try {
              console.log("Attempting to decompress with LZString...");
              const decompressedData = LZString.decompressFromEncodedURIComponent(encodedLogs);
              
              if (decompressedData) {
                try {
                  // Try to parse the decompressed data as JSON
                  decodedData = JSON.parse(decompressedData);
                  console.log("Successfully decompressed and parsed logs with LZString");
                } catch (parseError) {
                  // If not valid JSON after decompression, it might be raw content
                  decodedData = decompressedData;
                  console.log("Decompressed data is not JSON, using as raw content");
                }
              } else {
                // If LZString decompression failed, try Base64 decoding
                throw new Error("LZString decompression failed");
              }
            } catch (lzError) {
              // Try Base64 decoding as fallback
              console.log("LZString failed, trying Base64 decoding...");
              decodedData = decodeLogs(encodedLogs);
              console.log("Successfully decoded logs from Base64");
            }
          } catch (decodeError) {
            throw new Error("Failed to decode logs: " + decodeError.message);
          }
        }
      }
      
      // Process the logs using the proper processor based on format
      let processed;
      if (format === "line-by-line" || (typeof decodedData === 'string' && decodedData.trim().startsWith("{") && decodedData.includes('{"event":'))) {
        processed = processNewFormatLogs(decodedData);
      } else {
        processed = processEncodedLog(decodedData);
      }
      
      // Process the transformed data
      resetVisualization();
      currentScenario = processed;
      logData = processed.logs;
      graphStateData = processed.graph_state;

      // Set step if provided
      currentStep = step ? parseInt(step) : 1;
      if (
        isNaN(currentStep) ||
        currentStep < 1 ||
        currentStep > logData.length
      ) {
        currentStep = 1;
      }
      console.log("Setting to step:", currentStep);

      // Show share button
      const shareBtn = document.getElementById("share-btn");
      if (shareBtn) {
        shareBtn.style.display = "flex";
      }

      // Initialize visualization after a short delay to ensure DOM is ready
      setTimeout(() => {
        initVisualization();

        // Hide loading message and show visualization elements
        showVisualizationElements();

        // Initialize timeline
        initTimeline();

        // Update visualization with the specified step
        updateVisualization();

        console.log("Shared visualization loaded successfully");
      }, 100);
    } catch (error) {
      console.error("Error loading encoded logs:", error);
      document.getElementById("loading").innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Error loading visualization from logs parameter: ${error.message}
                </div>`;
    }
  }

  // Handle data parameter for backward compatibility
  else if (encodedData) {
    // Handle the existing LZString format
    try {
      console.log("Found shared data in URL, processing...")

      // Show loading state
      document.getElementById("loading").style.display = "block"
      document.getElementById("loading").innerHTML =
        '<div class="spinner"></div><p>Loading shared visualization...</p>'

      // Decode the data
      console.log("Compressed data size:", encodedData.length, "bytes")
      const decompressedData =
        LZString.decompressFromEncodedURIComponent(encodedData)

      if (!decompressedData) {
        throw new Error("Failed to decompress data")
      }

      console.log("Decompressed data size:", decompressedData.length, "bytes")
      const scenarioData = JSON.parse(decompressedData)
      console.log("Successfully parsed JSON data")

      // Check if this is the new raw format
      if (
        Array.isArray(scenarioData) &&
        scenarioData.length >= 1 &&
        Array.isArray(scenarioData[0])
      ) {
        // Process raw data
        console.log("Raw log format detected, transforming data")
        const transformed = transformRawObject(scenarioData)

        // Store original data for sharing
        transformed.rawData = scenarioData

        // Process the transformed data
        resetVisualization()
        currentScenario = transformed
        logData = transformed.logs
        graphStateData = transformed.graph_state

        // Set step if provided
        currentStep = step ? parseInt(step) : 1
        if (
          isNaN(currentStep) ||
          currentStep < 1 ||
          currentStep > logData.length
        ) {
          currentStep = 1
        }
        console.log("Setting to step:", currentStep)

        // Show share button
        const shareBtn = document.getElementById("share-btn")
        if (shareBtn) {
          shareBtn.style.display = "flex"
        }

        // Initialize visualization
        setTimeout(() => {
          initVisualization()

          // Hide loading message and show visualization elements
          showVisualizationElements()

          // Initialize timeline
          initTimeline()

          // Update visualization with the specified step
          updateVisualization()

          console.log("Shared visualization loaded successfully")
        }, 100)
      }
      // Check if it's a standard format
      else if (validateDeadlockLog(scenarioData)) {
        console.log("Valid deadlock log format detected")

        // Process the scenario data
        resetVisualization()
        currentScenario = scenarioData
        logData = scenarioData.logs
        graphStateData = scenarioData.graph_state

        // Update scenario information
        updateScenarioInfo(scenarioData)

        // Set step if provided
        currentStep = step ? parseInt(step) : 1
        if (
          isNaN(currentStep) ||
          currentStep < 1 ||
          currentStep > logData.length
        ) {
          currentStep = 1
        }
        console.log("Setting to step:", currentStep)

        // Show share button
        const shareBtn = document.getElementById("share-btn")
        if (shareBtn) {
          shareBtn.style.display = "flex"
        }

        // Initialize visualization
        setTimeout(() => {
          initVisualization()

          // Hide loading message and show visualization elements
          showVisualizationElements()

          // Initialize timeline
          initTimeline()

          // Update visualization with the specified step
          updateVisualization()

          console.log("Shared visualization loaded successfully")
        }, 100)
      } else {
        console.error("Invalid log format in shared URL")
        document.getElementById("loading").innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Error: Invalid log format in shared URL
                </div>`
      }
    } catch (error) {
      console.error("Error loading shared visualization:", error)
      document.getElementById("loading").innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Error loading shared visualization: ${error.message}
                </div>`
    }
  }
}

// Helper function to validate deadlock log structure
function validateDeadlockLog(json) {
  // Standard format check
  return (
    json &&
    typeof json === "object" &&
    Array.isArray(json.logs) &&
    json.logs.length > 0 &&
    Array.isArray(json.graph_state) &&
    json.graph_state.length > 0
  )
}

// Update scenario info in the UI
function updateScenarioInfo(scenarioData) {
  // Function intentionally left empty - title and description are no longer used
}

// Initialize theme
const initTheme = () => {
  const currentTheme = getCurrentTheme()
  applyTheme(currentTheme)

  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme)
  }

  // Listen for system theme changes
  prefersDarkScheme.addEventListener("change", (e) => {
    if (!localStorage.getItem("theme")) {
      applyTheme(e.matches ? "dark" : "light")
    }
  })
}

/**
 * Check if D3.js is available
 */
function checkD3Availability() {
  if (typeof d3 === "undefined") {
    console.error("D3.js is not loaded")
    return false
  }
  return true
}

/**
 * Load scenario list and populate dropdown
 */
async function loadScenarioList() {
  // Show instruction message for uploading log files
  const loadingElement = document.getElementById("loading")
  if (loadingElement) {
    loadingElement.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-upload"></i>
                <h2>Deadlock Visualization</h2>
                <p>Click the "Upload" button to load a deadlock log file.</p>
            </div>`
  }
}

/**
 * Reset the visualization
 */
function resetVisualization() {
  // Stop simulation if running
  if (simulation) {
    simulation.stop()
    simulation.alpha(0) // Ensure the simulation is fully cooled down
  }

  // Clear all graph elements
  if (svg) {
    // Preserve the SVG container, just remove the contents
    svg.selectAll("*").remove()
  }

  // Reset the node groups
  linkGroup = null
  nodeGroup = null

  // Reset data
  nodes = []
  links = []

  // Reset step
  currentStep = 1

  // Reset controls
  document.getElementById("prev-btn").disabled = true
  document.getElementById("next-btn").disabled = false

  // Make sure the visualization container is visible
  const visualizationContainer = document.querySelector(".visualization-container")
  if (visualizationContainer) {
    visualizationContainer.style.display = "flex"
  }

  // Make sure all UI elements are properly displayed
  document.getElementById("graph").style.display = "block"
  document.getElementById("controls").style.display = "flex"

  // Clear any transform styles that may have been applied during interaction
  document.querySelectorAll(".node").forEach((node) => {
    if (node.style) {
      node.style.transform = ""
    }
  })
}

/**
 * Initialize the D3.js visualization
 */
function initVisualization() {
  // Disable the previous button initially
  document.getElementById("prev-btn").disabled = true

  // Get the graph container
  const graphContainer = document.getElementById("graph")

  // Clear any previous SVG
  graphContainer.innerHTML = ""

  // Get dimensions of the graph container
  const width = graphContainer.clientWidth
  const height = graphContainer.clientHeight
  const centerX = width / 2
  const centerY = height / 2

  // Create svg element to hold the visualization
  svg = d3
    .select("#graph")
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")

  // Create defs section for markers
  const defs = svg.append("defs");

  // Add standard arrow marker for links
  defs.append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 28) // Push the arrowhead back to be behind the node circle
    .attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("xoverflow", "visible")
    .append("path")
    .attr("d", "M 0,-4 L 10,0 L 0,4 L 4,0 Z") // Improved arrow shape
    .attr("fill", "var(--primary-color)")
    .style("stroke", "none");

  // Add attempt arrow marker with dashed style
  defs.append("marker")
    .attr("id", "attempt-arrowhead")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 28) // Push the arrowhead back to be behind the node circle
    .attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("xoverflow", "visible")
    .append("path")
    .attr("d", "M 0,-4 L 10,0 L 0,4 L 4,0 Z") // Improved arrow shape
    .attr("fill", "var(--warning-color)")
    .style("stroke", "none");

  // Add acquired arrow marker with a thicker line
  defs.append("marker")
    .attr("id", "acquired-arrowhead")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 28) // Push the arrowhead back to be behind the node circle
    .attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 9)
    .attr("markerHeight", 9)
    .attr("xoverflow", "visible")
    .append("path")
    .attr("d", "M 0,-4 L 10,0 L 0,4 L 4,0 Z") // Improved arrow shape
    .attr("fill", "var(--success-color)")
    .style("stroke", "none");

  // Add special marker for deadlock arrows with a distinctive shape
  defs.append("marker")
    .attr("id", "deadlock-arrowhead")
    .attr("viewBox", "0 -6 12 12")
    .attr("refX", 28) // Push the arrowhead back to be behind the node circle
    .attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 8) // Reduced from 10
    .attr("markerHeight", 8) // Reduced from 10
    .attr("xoverflow", "visible")
    .append("path")
    .attr("d", "M 0,-4 L 10,0 L 0,4 L 4,0 Z") // Smaller arrow shape
    .attr("fill", "#f44336")
    .style("stroke", "none");

  // Create tooltip
  tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)

  // Define groups for links and nodes
  linkGroup = svg.append("g").attr("class", "links")
  nodeGroup = svg.append("g").attr("class", "nodes")

  // Create the force simulation
  simulation = d3
    .forceSimulation()
    .force(
      "link",
      d3
        .forceLink()
        .id((d) => d.id)
        .distance(150) // Increased from 120 for more spacing between nodes
    )
    .force("charge", d3.forceManyBody().strength(-800)) // Increased from -600 for stronger repulsion
    .force("center", d3.forceCenter(centerX, centerY))
    .force("collide", d3.forceCollide().radius(80)) // Increased from 60 to avoid overlapping
    .force("x", d3.forceX(centerX).strength(0.1)) // Add force to pull nodes toward center X
    .force("y", d3.forceY(centerY).strength(0.1)) // Add force to pull nodes toward center Y
    .on("tick", ticked)

  // Fixed initial positions for better visual consistency during reset
  if (graphStateData && graphStateData.length > 0 && graphStateData[0].nodes) {
    const initialState = graphStateData[0]

    // Create a map of node positions
    const nodePositions = {}

    initialState.nodes.forEach((node, index) => {
      // Calculate fixed positions in a circle layout
      const angle = (index / initialState.nodes.length) * 2 * Math.PI
      const radius = Math.min(width, height) * 0.35 // 35% of the smaller dimension

      nodePositions[node.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      }
    })

    // Update the graph state data with these fixed positions
    graphStateData.forEach((state) => {
      state.nodes.forEach((node) => {
        if (nodePositions[node.id]) {
          node.fx = nodePositions[node.id].x
          node.fy = nodePositions[node.id].y
        }
      })
    })
  }

  // Update visualization for the initial step
  updateVisualization()
}

/**
 * Update the visualization based on current step
 */
function updateVisualization() {
  // Make sure there's graph data for the current step
  if (
    !graphStateData ||
    currentStep < 1 ||
    currentStep > graphStateData.length
  ) {
    console.error("Invalid step or missing graph state data")
    return
  }

  // Update button states
  document.getElementById("prev-btn").disabled = currentStep <= 1
  document.getElementById("next-btn").disabled = currentStep >= logData.length

  // Get current graph state
  const currentState = graphStateData[currentStep - 1]
  
  // Get current log entry
  const logEntry = logData[currentStep - 1]
  console.log(`Updating visualization for step ${currentStep}:`, logEntry.type);
  
  // Check if this is a deadlock event
  if (logEntry && logEntry.type === "deadlock") {
    console.log("DEADLOCK EVENT - Showing deadlock visualization");
    
    // If there's a next state specifically for the deadlock, use that instead
    if (currentStep < graphStateData.length) {
      const nextState = graphStateData[currentStep];
      // Check if the next state has deadlock links
      const hasDeadlockLinks = nextState.links.some(link => link.type === "deadlock");
      if (hasDeadlockLinks) {
        console.log("Found dedicated deadlock state - using it");
        
        // Instead of recreating the array and losing reference, update existing nodes
        // First, create a map of existing nodes by ID for quick lookup
        const nodeMap = {};
        nodes.forEach(node => {
          nodeMap[node.id] = node;
        });
        
        // Update existing nodes with new data, preserving positions
        const newNodes = JSON.parse(JSON.stringify(nextState.nodes));
        const updatedNodes = newNodes.map(newNode => {
          const existingNode = nodeMap[newNode.id];
          if (existingNode) {
            // Keep the existing position to avoid jumping
            newNode.x = existingNode.x;
            newNode.y = existingNode.y;
            return {...existingNode, ...newNode};
          }
          return newNode;
        });
        
        // Update nodes reference with the updated data
        nodes = updatedNodes;
        
        // Handle links - create a new array but with proper node references
        links = [];
        JSON.parse(JSON.stringify(nextState.links)).forEach(link => {
          const sourceNode = typeof link.source === 'object' ? 
            nodes.find(n => n.id === link.source.id) : 
            nodes.find(n => n.id === link.source);
          
          const targetNode = typeof link.target === 'object' ? 
            nodes.find(n => n.id === link.target.id) : 
            nodes.find(n => n.id === link.target);
          
          if (sourceNode && targetNode) {
            links.push({
              source: sourceNode,
              target: targetNode,
              type: link.type,
              isDeadlockEdge: link.isDeadlockEdge || false
            });
          }
        });
        
        console.log("Deadlock links count:", links.filter(l => l.type === "deadlock").length);
        
        // Update visualization based on current state
        updateNodeElements();
        updateLinkElements();
        
        // Update simulation with the processed nodes and links
        simulation.nodes(nodes);
        simulation.force("link").links(links);
        
        // Restart with a low alpha to avoid extreme movements
        simulation.alpha(0.3).restart();
        
        // Update step information
        updateStepInfo();
        
        // Update timeline marker
        updateTimelineMarker();
        
        return;
      }
    }
  }

  // Create a map of existing nodes by ID for quick lookup
  const nodeMap = {};
  nodes.forEach(node => {
    nodeMap[node.id] = node;
  });
  
  // Create a new array of nodes with transition-friendly updates
  const newNodes = JSON.parse(JSON.stringify(currentState.nodes));
  
  // Add parent_id information for all nodes from log data
  newNodes.forEach(node => {
    if (node.type === "thread") {
      const threadId = parseInt(node.id.substring(1)); // Remove the 'T' prefix and convert to number
      
      // If this is a deadlock state, mark threads in the deadlock cycle
      if (logEntry && logEntry.type === "deadlock" && logEntry.deadlock_details) {
        const deadlockThreads = logEntry.deadlock_details.thread_cycle || [];
        if (deadlockThreads.includes(threadId) || deadlockThreads.includes(threadId.toString())) {
          node.isInCycle = true;
        }
      }
      
      // Identify main thread
      let mainThreadId = null;
      // Find the first thread with parent_id that's not 0 (the main thread)
      for (let i = 0; i < logData.length; i++) {
        const log = logData[i];
        if (log.type === "spawn" && log.parent_id !== 0 && !mainThreadId) {
          mainThreadId = log.parent_id;
          break;
        }
      }
      
      // Mark this node as main thread if it matches
      if (threadId === mainThreadId) {
        node.is_main_thread = true;
        node.name = "Main Thread";
      }
      
      // Add parent_id information from log data if available
      const threadLogEntry = logData.find(entry => 
        entry.thread_id === threadId && entry.type === "spawn"
      );
      
      if (threadLogEntry && threadLogEntry.parent_id) {
        node.parent_id = threadLogEntry.parent_id;
        
        // Check if the parent is the main thread
        if (threadLogEntry.parent_id === mainThreadId) {
          node.parent_id_is_main = true;
        }
      }
    }
    else if (node.type === "resource") {
      const resourceId = node.id.substring(1); // Remove the 'R' prefix
      
      // Find main thread ID
      let mainThreadId = null;
      for (let i = 0; i < logData.length; i++) {
        const log = logData[i];
        if (log.type === "spawn" && log.parent_id !== 0 && !mainThreadId) {
          mainThreadId = log.parent_id;
          break;
        }
      }
      
      // Add parent_id for resources if available
      const resourceLogEntry = logData.find(entry => 
        entry.resource_id === resourceId && entry.type === "spawn"
      );
      
      if (resourceLogEntry && resourceLogEntry.parent_id) {
        node.parent_id = resourceLogEntry.parent_id;
        
        // Check if the parent is the main thread
        if (resourceLogEntry.parent_id === mainThreadId) {
          node.parent_id_is_main = true;
        }
      }
    }
    
    // Preserve position for smooth transition if the node already exists
    const existingNode = nodeMap[node.id];
    if (existingNode) {
      node.x = existingNode.x;
      node.y = existingNode.y;
    }
  });

  // Update the nodes array
  nodes = newNodes;

  // First update simulation with just the nodes
  simulation.nodes(nodes);
  
  // Then prepare the links
  links = [];
  const currentLinks = JSON.parse(JSON.stringify(currentState.links));
  
  // Process each link to ensure it has proper references to node objects
  currentLinks.forEach(link => {
    const sourceNode = typeof link.source === 'object' ? 
      nodes.find(n => n.id === link.source.id) : 
      nodes.find(n => n.id === link.source);
    
    const targetNode = typeof link.target === 'object' ? 
      nodes.find(n => n.id === link.target.id) : 
      nodes.find(n => n.id === link.target);
    
    if (sourceNode && targetNode) {
      links.push({
        source: sourceNode,
        target: targetNode,
        type: link.type,
        isDeadlockEdge: link.isDeadlockEdge || false
      });
    }
  });
  
  // Add manual deadlock links if needed for the current step
  if (logEntry && logEntry.type === "deadlock" && logEntry.deadlock_details) {
    const deadlockThreads = logEntry.deadlock_details.thread_cycle || [];
    
    if (deadlockThreads.length >= 2 && links.filter(l => l.type === "deadlock").length === 0) {
      console.log("Adding manual deadlock links");
      
      // Create deadlock links directly between threads in the cycle
      for (let i = 0; i < deadlockThreads.length; i++) {
        const currentThread = deadlockThreads[i];
        const nextThread = deadlockThreads[(i + 1) % deadlockThreads.length];
        
        const sourceNode = nodes.find(n => n.id === `T${currentThread}`);
        const targetNode = nodes.find(n => n.id === `T${nextThread}`);
        
        if (sourceNode && targetNode) {
          console.log(`Adding deadlock link from T${currentThread} to T${nextThread}`);
          links.push({
            source: sourceNode,
            target: targetNode,
            type: "deadlock",
            isDeadlockEdge: true
          });
        }
      }
    }
  }
  
  console.log("Final links count:", links.length, "deadlock links:", links.filter(l => l.type === "deadlock").length);
  
  // Update visualization based on current state
  updateNodeElements();
  updateLinkElements();

  // Update simulation with links after nodes are set
  simulation.force("link").links(links);

  // Restart with a low alpha to avoid extreme movements
  simulation.alpha(0.3).restart();

  // Update step information
  updateStepInfo();

  // Update timeline marker
  updateTimelineMarker();
}

// Helper function to update node elements
function updateNodeElements() {
  // Instead of removing all nodes, we'll use D3's enter/update/exit pattern
  const nodeSelection = nodeGroup
    .selectAll(".node")
    .data(nodes, d => d.id); // Key function to maintain identity
  
  // Exit - remove nodes that no longer exist with animation
  nodeSelection.exit()
    .transition()
    .duration(200) // Reduced from 300 for faster removal
    .style("opacity", 0)
    .remove();
  
  // Enter - add new nodes
  const nodeEnter = nodeSelection
    .enter()
    .append("g")
    .attr("class", d => `node ${d.type}`)
    .attr("data-in-cycle", d => d.isInCycle === true ? "true" : "false")
    .attr("transform", d => `translate(${d.x || 0}, ${d.y || 0})`)
    .style("opacity", 0) // Start invisible for fade-in
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));
  
  // Add circles to new nodes
  nodeEnter
    .append("circle")
    .attr("r", 0) // Start with radius 0
    .attr("fill", d => {
      if (d.type === "thread") {
        return d.is_main_thread ? "#9b59b6" : "var(--danger-color)"; // Purple for main thread
      }
      return "var(--primary-color)"; // Default color for resources
    })
    .attr("stroke", d => {
      if (d.type === "thread") {
        if (d.isInCycle) {
          return "#f44336"; // Modern red for deadlock threads
        }
        return d.is_main_thread ? "#8e44ad" : "var(--danger-dark)"; // Darker purple for main thread
      }
      return "var(--primary-dark)";
    })
    .attr("stroke-width", d => d.isInCycle ? "2px" : "2px")
    .attr("stroke-dasharray", d => d.isInCycle ? "3" : "none");
  
  // Add text labels to new nodes
  nodeEnter
    .append("text")
    .attr("dy", 5)
    .text(d => d.id)
    .attr("fill", "white")
    .style("opacity", 0); // Start with transparent text
  
  // Apply special effects for new nodes
  nodeEnter.selectAll("circle").each(function(d) {
    if (d.isInCycle) {
      // Add a subtle glow effect for threads in deadlock
      d3.select(this).style("filter", "drop-shadow(0 0 2px rgba(244, 67, 54, 0.6))");
    } else if (d.is_main_thread) {
      // Add a subtle glow effect for main thread
      d3.select(this).style("filter", "drop-shadow(0 0 4px rgba(155, 89, 182, 0.7))");
    }
  });
  
  // Animate new nodes appearing
  nodeEnter
    .transition()
    .duration(250) // Reduced from 400 for faster appearance
    .style("opacity", 1) // Fade in the node
    .select("circle")
    .attr("r", 25); // Grow to full size
    
  // Animate text appearing in new nodes
  nodeEnter
    .select("text")
    .transition()
    .delay(100) // Reduced from 200 for faster text appearance
    .duration(150) // Reduced from 200 for faster text appearance
    .style("opacity", 1);
    
  // Update - handle existing nodes
  const nodeUpdate = nodeSelection
    .transition()
    .duration(300) // Reduced from 500 for faster updates
    .attr("data-in-cycle", d => d.isInCycle === true ? "true" : "false")
    .attr("transform", d => `translate(${d.x || 0}, ${d.y || 0})`);
    
  // Update attributes of existing circles
  nodeUpdate.select("circle")
    .attr("fill", d => {
      if (d.type === "thread") {
        return d.is_main_thread ? "#9b59b6" : "var(--danger-color)"; // Purple for main thread
      }
      return "var(--primary-color)"; // Default color for resources
    })
    .attr("stroke", d => {
      if (d.type === "thread") {
        if (d.isInCycle) {
          return "#f44336"; // Modern red for deadlock threads
        }
        return d.is_main_thread ? "#8e44ad" : "var(--danger-dark)"; // Darker purple for main thread
      }
      return "var(--primary-dark)";
    })
    .attr("stroke-width", d => d.isInCycle ? "2px" : "2px")
    .attr("stroke-dasharray", d => d.isInCycle ? "3" : "none");
  
  // Merge enter and update for event handlers
  nodeSelection.merge(nodeEnter)
    .on("mouseover", function(event, d) {
      // Don't apply any transforms that might move the node away from cursor
      let tooltipContent;
      
      // If this is the main thread, display it as such
      if (d.is_main_thread) {
        tooltipContent = 'Main Thread';
      } else {
        tooltipContent = d.name;
      }
      
      // Add parent_id information if available
      if (d.parent_id) {
        // Check if the parent is the main thread
        if (d.parent_id_is_main) {
          tooltipContent += `<br>Parent: Main Thread`;
        } else {
          tooltipContent += `<br>Parent: Thread ${d.parent_id}`;
        }
      }
      
      d3.select(".tooltip")
        .style("opacity", 0.9)
        .html(tooltipContent)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function() {
      d3.select(".tooltip")
        .style("opacity", 0);
    });
    
  // Update filter effects for existing nodes
  nodeSelection.select("circle").each(function(d) {
    if (d.isInCycle) {
      d3.select(this).style("filter", "drop-shadow(0 0 2px rgba(244, 67, 54, 0.6))");
    } else if (d.is_main_thread) {
      d3.select(this).style("filter", "drop-shadow(0 0 4px rgba(155, 89, 182, 0.7))");
    } else {
      d3.select(this).style("filter", "none");
    }
  });
}

// Helper function to update link elements
function updateLinkElements() {
  // Use D3's enter/update/exit pattern for links
  const linkSelection = linkGroup
    .selectAll(".link")
    .data(links, d => `${d.source.id}-${d.target.id}-${d.type}`); // Key function to maintain identity
  
  // Exit - remove links that no longer exist with animation
  linkSelection.exit()
    .transition()
    .duration(200) // Reduced from 300 for faster removal
    .style("opacity", 0)
    .remove();
  
  // Enter - add new links
  const linkEnter = linkSelection
    .enter()
    .append("line")
    .attr("class", d => `link ${d.type}`)
    .attr("x1", d => d.source.x || 0)
    .attr("y1", d => d.source.y || 0)
    .attr("x2", d => d.target.x || 0)
    .attr("y2", d => d.target.y || 0)
    .style("opacity", 0); // Start invisible for fade-in
  
  // Apply style based on link type
  linkEnter.each(function(d) {
    if (d.type === "deadlock") {
      d3.select(this)
        .attr("stroke", "#f44336") 
        .attr("stroke-width", "3") // Reduced from 4
        .attr("marker-end", "url(#deadlock-arrowhead)")
        .style("filter", "drop-shadow(0 0 3px rgba(244, 67, 54, 0.7))") // Reduced from 4px
        .style("stroke-dashoffset", "0");
    } else if (d.type === "attempt") {
      d3.select(this)
        .attr("stroke", "var(--warning-color)")
        .attr("stroke-width", "2.5")
        .attr("marker-end", "url(#attempt-arrowhead)")
        .style("stroke-dasharray", "5,3");
    } else if (d.type === "acquired") {
      d3.select(this)
        .attr("stroke", "var(--success-color)")
        .attr("stroke-width", "3")
        .attr("marker-end", "url(#acquired-arrowhead)")
        .style("filter", "drop-shadow(0 0 2px rgba(39, 174, 96, 0.5))");
    } else {
      d3.select(this)
        .attr("stroke", "var(--primary-color)")
        .attr("stroke-width", "2.5")
        .attr("marker-end", "url(#arrowhead)");
    }
  });
  
  // Animate new links appearing with slight delay
  linkEnter
    .transition()
    .delay(100) // Reduced from 200 for faster appearance
    .duration(200) // Reduced from 300 for faster appearance
    .style("opacity", 1);
  
  // Update - handle existing links
  const linkUpdate = linkSelection
    .transition()
    .duration(300); // Reduced from 500 for faster updates
    
  // Update position attributes
  linkUpdate
    .attr("x1", d => d.source.x || 0)
    .attr("y1", d => d.source.y || 0)
    .attr("x2", d => d.target.x || 0)
    .attr("y2", d => d.target.y || 0);
  
  // Update all link styles
  linkSelection.each(function(d) {
    if (d.type === "deadlock") {
      d3.select(this)
        .attr("stroke", "#f44336") 
        .attr("stroke-width", "3") // Reduced from 4
        .attr("marker-end", "url(#deadlock-arrowhead)")
        .style("filter", "drop-shadow(0 0 3px rgba(244, 67, 54, 0.7))") // Reduced from 4px
        .style("stroke-dashoffset", "0");
    } else if (d.type === "attempt") {
      d3.select(this)
        .attr("stroke", "var(--warning-color)")
        .attr("stroke-width", "2.5")
        .attr("marker-end", "url(#attempt-arrowhead)")
        .style("stroke-dasharray", "5,3")
        .style("filter", "none");
    } else if (d.type === "acquired") {
      d3.select(this)
        .attr("stroke", "var(--success-color)")
        .attr("stroke-width", "3")
        .attr("marker-end", "url(#acquired-arrowhead)")
        .style("filter", "drop-shadow(0 0 2px rgba(39, 174, 96, 0.5))");
    } else {
      d3.select(this)
        .attr("stroke", "var(--primary-color)")
        .attr("stroke-width", "2.5")
        .attr("marker-end", "url(#arrowhead)")
        .style("filter", "none")
        .style("stroke-dasharray", "none");
    }
  });
}

/**
 * Update step information in the info panel
 */
function updateStepInfo() {
  const stepInfoElement = document.getElementById("step-info")
  const waitGraphElement = document.getElementById("wait-graph")

  if (stepInfoElement) {
    // Remove existing animation classes before adding new ones
    stepInfoElement.querySelectorAll('.animate__animated').forEach(el => {
      el.classList.remove('animate__animated', 'animate__fadeIn');
    });

    // Get the log entry for current step
    const logEntry = logData[currentStep - 1]

    // Create main step info with clean formatting
    let stepInfoContent = `<h3 class="animate__animated animate__fadeIn">Step ${logEntry.step}: ${logEntry.type.charAt(0).toUpperCase() + logEntry.type.slice(1)}</h3>`

    // Create a more descriptive message based on event type
    if (logEntry.type === "attempt") {
      // Use the description property which now contains both IDs
      stepInfoContent += `<p class="animate__animated animate__fadeIn">${logEntry.description}.</p>`
    } else if (logEntry.type === "acquired") {
      // Use the description property which now contains both IDs
      stepInfoContent += `<p class="animate__animated animate__fadeIn">${logEntry.description}.</p>`
    } else if (logEntry.type === "released") {
      // Use the description property which now contains both IDs
      stepInfoContent += `<p class="animate__animated animate__fadeIn">${logEntry.description}.</p>`
    } else if (logEntry.type === "init") {
      stepInfoContent += `<p class="animate__animated animate__fadeIn">${logEntry.description || "No description available"}</p>`
    } else if (logEntry.type === "deadlock") {
      // For deadlock, format the description with line breaks for better readability
      const deadlockPrefix = '<strong>DEADLOCK DETECTED:</strong>';

      // Remove the prefix from the description to work with just the thread details
      let deadlockDetails = logEntry.description.replace(deadlockPrefix, '').trim();

      // Format the deadlock details with line breaks
      if (deadlockDetails.includes(',')) {
        // Split by comma and 'and' to get individual thread statements
        let statements = deadlockDetails.split(/,\s*(?=<span)|and\s*(?=<span)/);

        // Format with line breaks
        deadlockDetails = statements.map(statement => statement.trim()).join(',<br>');

        // Replace the last comma with 'and' if there was an 'and' in the original
        if (logEntry.description.includes(' and ')) {
          const lastCommaIndex = deadlockDetails.lastIndexOf(',<br>');
          if (lastCommaIndex !== -1) {
            deadlockDetails =
                deadlockDetails.substring(0, lastCommaIndex) +
                ' and<br>' +
                deadlockDetails.substring(lastCommaIndex + 5);
          }
        }
      }

      // Reconstruct the full description with prefix and formatted details and animations
      stepInfoContent += `<p class="animate__animated animate__fadeIn animate__headShake">${deadlockPrefix}<br>${deadlockDetails}</p>`;
    } else {
      // Fallback for any other event types
      stepInfoContent += `<p class="animate__animated animate__fadeIn">${logEntry.description || "No description available"}</p>`
    }

    if (logEntry.code_reference) {
      stepInfoContent += `<p class="animate__animated animate__fadeIn"><strong>Code Reference:</strong> <code class="code-reference">${logEntry.code_reference}</code></p>`
    }

    // Add timestamp only if not step 1 (init)
    if (logEntry.type !== "init" && logEntry.timestamp) {
      const date = new Date(logEntry.timestamp);

      // Format with more details including date, time with milliseconds, and Unix timestamp
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

      // Get month name and day
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = monthNames[date.getMonth()];
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();

      // Create formatted timestamp
      const formattedTime = `${hours}:${minutes}:${seconds}.${milliseconds}`;
      const formattedDate = `${month} ${day}, ${year}`;

      // Add Unix timestamp (in seconds and milliseconds)
      const unixTimestamp = logEntry.timestamp / 1000;
      const unixSeconds = Math.floor(unixTimestamp);
      const remainingMs = logEntry.timestamp % 1000;

      stepInfoContent += `
        <div class="timestamp animate__animated animate__fadeIn">
          <i class="far fa-clock"></i> 
          <span class="timestamp-datetime">${formattedDate} ${formattedTime}</span>
        </div>`;
    }

    // Set content
    stepInfoElement.innerHTML = stepInfoContent
  }

  // Update wait-for graph information if applicable
  if (waitGraphElement) {
    const logEntry = logData[currentStep - 1]

    // If this is a deadlock event, show detailed information
    if (logEntry.type === "deadlock" && logEntry.deadlock_details) {
      waitGraphElement.style.display = "block"

      // Construct wait-for graph explanation with improved design
      let waitGraphContent = `<h3 class="animate__animated animate__fadeIn">Deadlock Cycle</h3><div id="wait-graph-content" class="animate__animated animate__fadeIn">`

      // Format the cycle with better visualization
      const cycle = logEntry.deadlock_details.thread_cycle || []
      
      if (cycle.length > 0) {
        // Create a nicer cycle visualization
        waitGraphContent += `<div class="cycle-visualization animate__animated animate__pulse">`
        cycle.forEach((threadId, index) => {
          waitGraphContent += `<span class="thread-id">Thread ${threadId}</span>`
          if (index < cycle.length - 1) {
            waitGraphContent += ` <i class="fas fa-long-arrow-alt-right"></i> `
          }
        })

        // Add arrow back to first thread to show the cycle clearly
        if (cycle.length > 1) {
          waitGraphContent += ` <i class="fas fa-long-arrow-alt-right"></i> <span class="thread-id">Thread ${cycle[0]}</span>`
        }

        // Add non-breaking spaces for visible spacing at the end (using &nbsp;)
        waitGraphContent += `<span class="end-spacing">&nbsp;&nbsp;&nbsp;&nbsp;</span></div>`

        // Add explanation of what the cycle means
        waitGraphContent += `<p class="deadlock-explanation animate__animated animate__fadeIn">This circular waiting pattern creates a deadlock where no thread can proceed.</p>`
      }

      waitGraphContent += `</div>`

      waitGraphElement.innerHTML = waitGraphContent
    } else if (logEntry.wait_for_edge) {
      waitGraphElement.style.display = "block"

      // Show simple wait-for edge with improved description
      const { from, to } = logEntry.wait_for_edge
      
      let waitGraphContent = `<h3 class="animate__animated animate__fadeIn">Resource Waiting</h3><div id="wait-graph-content" class="animate__animated animate__fadeIn">`
      waitGraphContent += `<p class="animate__animated animate__fadeIn"><span class="thread-id">Thread ${from}</span> is waiting for a resource held by <span class="thread-id">Thread ${to}</span>.</p>`
      waitGraphContent += `</div>`

      waitGraphElement.innerHTML = waitGraphContent
    } else {
      // Hide the wait graph for non-deadlock events
      waitGraphElement.style.display = "none"
    }
  }
}

/**
 * Update the timeline marker position
 */
function updateTimelineMarker() {
  const timelineElement = document.getElementById("timeline")
  const timelineMarker = document.getElementById("timeline-marker")

  if (!timelineElement || !timelineMarker || !logData || logData.length === 0) {
    return
  }

  // Find the corresponding timeline event element
  const currentEvent = document.querySelector(
    `.timeline-event[data-step="${currentStep}"]`
  )

  if (currentEvent) {
    // Get the left position of the current event and calculate the marker position
    const eventLeft = parseFloat(currentEvent.style.left)
    timelineMarker.style.left = `${eventLeft}px`

    // Apply highlight to current event
    const allEvents = document.querySelectorAll(".timeline-event")
    allEvents.forEach((event) => {
      if (parseInt(event.getAttribute("data-step")) === currentStep) {
        event.style.transform = "translate(-50%, -50%) scale(1.4)"
        event.style.boxShadow = "0 0 8px var(--primary-color)"
      } else {
        event.style.transform = "translate(-50%, -50%)"
        event.style.boxShadow = ""
      }
    })
  }
}

/**
 * D3.js force simulation tick function
 */
function ticked() {
  // Boundary collision detection
  const svgElement = document.querySelector("#graph svg")
  if (!svgElement) return

  const svgBounds = svgElement.getBoundingClientRect()
  const padding = 40 // Increased padding to keep nodes away from edges

  // Update node positions while keeping them within bounds
  nodes.forEach((d) => {
    // Make sure the simulation doesn't push nodes outside our viewport
    const minX = padding
    const maxX = svgBounds.width - padding
    const minY = padding
    const maxY = svgBounds.height - padding

    // Apply smoother boundary constraints
    d.x = Math.max(minX, Math.min(maxX, d.x))
    d.y = Math.max(minY, Math.min(maxY, d.y))
    
    // Apply a gentle push toward the center if nodes are getting too far away
    const distFromCenter = Math.sqrt(
      Math.pow(d.x - svgBounds.width/2, 2) + 
      Math.pow(d.y - svgBounds.height/2, 2)
    );
    
    const maxDist = Math.min(svgBounds.width, svgBounds.height) * 0.4;
    
    if (distFromCenter > maxDist) {
      // Calculate vector from current position to center
      const cx = svgBounds.width/2;
      const cy = svgBounds.height/2;
      const dx = cx - d.x;
      const dy = cy - d.y;
      const len = Math.sqrt(dx*dx + dy*dy);
      
      // Apply a gentle push toward the center
      const pushFactor = 0.1;
      d.x += (dx / len) * pushFactor * (distFromCenter - maxDist);
      d.y += (dy / len) * pushFactor * (distFromCenter - maxDist);
    }
  })

  // Update node positions with smooth transitions
  nodeGroup
    .selectAll(".node")
    .attr("transform", d => `translate(${d.x || 0}, ${d.y || 0})`)

  // Update link positions with smooth transitions  
  linkGroup
    .selectAll(".link")
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y)
}

/**
 * D3.js drag functions
 */
function dragstarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart()
  
  // Fix the node's position while dragging
  d.fx = d.x
  d.fy = d.y
  
  // Apply slight visual change without changing size
  const circle = d3.select(this).select("circle");
  circle
    .transition()
    .duration(100)
    .attr("stroke-width", 4) // Increase stroke width instead of radius
    .style("filter", "brightness(1.2)");
}

function dragged(event, d) {
  // Update the fixed position
  d.fx = event.x
  d.fy = event.y
  
  // Apply boundary constraints
  const svgElement = document.querySelector("#graph svg")
  if (svgElement) {
    const svgBounds = svgElement.getBoundingClientRect()
    const padding = 40
    
    // Keep node within bounds
    d.fx = Math.max(padding, Math.min(svgBounds.width - padding, d.fx));
    d.fy = Math.max(padding, Math.min(svgBounds.height - padding, d.fy));
  }
}

function dragended(event, d) {
  if (!event.active) simulation.alphaTarget(0)
  
  // Keep the node fixed at its final position unless shift key is pressed
  if (event.sourceEvent.shiftKey) {
    // Release the node to be affected by forces again
    d.fx = null;
    d.fy = null;
  }
  
  // Reset the node appearance
  const circle = d3.select(this).select("circle");
  circle
    .transition()
    .duration(200)
    .attr("stroke-width", 2) // Return to default stroke width
    .style("filter", null);
}

/**
 * Initialize the timeline with events
 */
function initTimeline() {
  const timelineElement = document.getElementById("timeline")

  if (timelineElement && logData.length > 0) {
    // Clear existing events
    while (timelineElement.firstChild) {
      timelineElement.removeChild(timelineElement.firstChild)
    }

    // Add back the line and marker
    timelineElement.appendChild(document.createElement("div")).id = "timeline-line"
    timelineElement.appendChild(document.createElement("div")).id = "timeline-marker"

    // Calculate event positions
    const totalWidth = timelineElement.clientWidth - 40 // 20px padding on each side

    // Create events with staggered animations
    logData.forEach((event, index) => {
      const position = 20 + (totalWidth * index) / (logData.length - 1)

      const eventElement = document.createElement("div")
      eventElement.className = `timeline-event ${event.type} animate__animated animate__fadeIn`
      eventElement.style.left = `${position}px`
      eventElement.setAttribute("data-step", event.step)
      eventElement.setAttribute("title", `Step ${event.step}: ${event.type}`)
      
      // Add staggered animation delay based on index
      eventElement.style.animationDelay = `${index * 50}ms`

      // Add additional animation class for deadlock events
      if (event.type === "deadlock") {
        eventElement.classList.add("animate__pulse")
        eventElement.style.animationIterationCount = "2"
      }

      eventElement.addEventListener("click", () => {
        // Stop any ongoing animation first
        if (isPlaying) {
          stopAnimation();
        }
        
        currentStep = event.step
        updateVisualization()
      })

      timelineElement.appendChild(eventElement)
    })
  }
}

// Variable to track if animation is in progress
let isAnimating = false;

/**
 * Toggle play/pause of animation
 */
function togglePlay() {
  const playBtn = document.getElementById("play-btn")
  const playBtnText = playBtn.querySelector("span")
  const playBtnIcon = playBtn.querySelector("i")

  if (isPlaying) {
    // Stop playback
    stopAnimation();
  } else {
    // Start playback
    playBtnText.textContent = "Stop"
    playBtnIcon.className = "fas fa-stop"
    isPlaying = true

    // Start from the beginning if at the end
    if (currentStep >= logData.length) {
      currentStep = 1
    }

    isAnimating = true;
    disableNavigationButtons();
    
    updateVisualization()

    // Calculate timing based on animation speed
    const animationDuration = Math.round(400 / animationSpeed); // Base duration adjusted by speed
    const intervalDuration = Math.round(1200 / animationSpeed); // Base interval adjusted by speed

    // Enable buttons after animation completes
    setTimeout(() => {
      isAnimating = false;
      enableNavigationButtons();
      
      let step = currentStep + 1
      animationInterval = setInterval(() => {
        if (step > logData.length) {
          stopAnimation();
          return
        }

        currentStep = step
        isAnimating = true;
        disableNavigationButtons();
        
        updateVisualization()
        
        // Enable buttons after animation completes
        setTimeout(() => {
          isAnimating = false;
          enableNavigationButtons();
          step++;
        }, animationDuration); // Duration adjusted by animation speed
      }, intervalDuration) // Interval adjusted by animation speed
    }, animationDuration); // Initial duration adjusted by animation speed
  }
}

/**
 * Helper function to disable navigation buttons during animation
 */
function disableNavigationButtons() {
  document.getElementById("prev-btn").disabled = true;
  document.getElementById("next-btn").disabled = true;
}

/**
 * Helper function to enable navigation buttons after animation
 */
function enableNavigationButtons() {
  // Only enable prev button if not at first step
  document.getElementById("prev-btn").disabled = currentStep <= 1;
  // Only enable next button if not at last step
  document.getElementById("next-btn").disabled = currentStep >= logData.length;
}

/**
 * Setup event listeners for UI controls
 */
function setupEventListeners() {
  document.getElementById("prev-btn").addEventListener("click", () => {
    // Don't allow navigation while animating or during cooldown
    if (isAnimating || buttonCooldown) {
      // Show feedback when user tries to click during cooldown
      if (buttonCooldown) {
        showButtonCooldownFeedback(document.getElementById("prev-btn"));
      }
      return;
    }
    
    // Stop any ongoing animation first
    if (isPlaying) {
      stopAnimation();
    }
 
    if (currentStep > 1) {
      // Set cooldown to prevent rapid clicking
      buttonCooldown = true;
      
      // Add visual indication of cooldown
      document.getElementById("prev-btn").classList.add("btn-cooldown");
      document.getElementById("next-btn").classList.add("btn-cooldown");
      
      currentStep--;
      isAnimating = true;
      disableNavigationButtons();
      updateVisualization();
      
      // Fixed animation duration at 2x speed (half the base duration)
      const fixedAnimationDuration = 200; // 400 / 2 = 200ms (2x speed)
      setTimeout(() => {
        isAnimating = false;
        enableNavigationButtons();
        
        // Reset cooldown after a delay to prevent rapid clicking
        setTimeout(() => {
          buttonCooldown = false;
          document.getElementById("prev-btn").classList.remove("btn-cooldown");
          document.getElementById("next-btn").classList.remove("btn-cooldown");
        }, 250); // Cooldown period after animation completes
      }, fixedAnimationDuration);
    }
  })

  document.getElementById("next-btn").addEventListener("click", () => {
    // Don't allow navigation while animating or during cooldown
    if (isAnimating || buttonCooldown) {
      // Show feedback when user tries to click during cooldown
      if (buttonCooldown) {
        showButtonCooldownFeedback(document.getElementById("next-btn"));
      }
      return;
    }
    
    // Stop any ongoing animation first
    if (isPlaying) {
      stopAnimation();
    }
    
    if (currentStep < logData.length) {
      // Set cooldown to prevent rapid clicking
      buttonCooldown = true;
      
      // Add visual indication of cooldown
      document.getElementById("prev-btn").classList.add("btn-cooldown");
      document.getElementById("next-btn").classList.add("btn-cooldown");
      
      currentStep++;
      isAnimating = true;
      disableNavigationButtons();
      updateVisualization();
      
      // Fixed animation duration at 2x speed (half the base duration)
      const fixedAnimationDuration = 200; // 400 / 2 = 200ms (2x speed)
      setTimeout(() => {
        isAnimating = false;
        enableNavigationButtons();
        
        // Reset cooldown after a delay to prevent rapid clicking
        setTimeout(() => {
          buttonCooldown = false;
          document.getElementById("prev-btn").classList.remove("btn-cooldown");
          document.getElementById("next-btn").classList.remove("btn-cooldown");
        }, 250); // Cooldown period after animation completes
      }, fixedAnimationDuration);
    }
  })

  document.getElementById("play-btn").addEventListener("click", togglePlay)

  document.getElementById("reset-btn").addEventListener("click", () => {
    resetGraph();
  })
  
  // Add event listeners for speed control buttons
  document.getElementById("speed-up-btn").addEventListener("click", () => {
    increaseAnimationSpeed();
  });
  
  document.getElementById("speed-down-btn").addEventListener("click", () => {
    decreaseAnimationSpeed();
  });

  // Add keyboard navigation
  document.addEventListener("keydown", (event) => {
    // Don't respond to keyboard during animation or cooldown
    if (isAnimating || buttonCooldown) {
      // Show feedback when user tries to use arrow keys during cooldown
      if (buttonCooldown && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        const button = event.key === "ArrowLeft" ? 
          document.getElementById("prev-btn") : 
          document.getElementById("next-btn");
        showButtonCooldownFeedback(button);
      }
      return;
    }
    
    // Left arrow key for previous step
    if (event.key === "ArrowLeft" && currentStep > 1) {
      event.preventDefault()
      
      if (isPlaying) {
        stopAnimation();
      }
      
      // Set cooldown to prevent rapid pressing
      buttonCooldown = true;
      
      // Add visual indication of cooldown
      document.getElementById("prev-btn").classList.add("btn-cooldown");
      document.getElementById("next-btn").classList.add("btn-cooldown");
      
      currentStep--;
      isAnimating = true;
      disableNavigationButtons();
      updateVisualization();
      
      // Fixed animation duration at 2x speed (half the base duration)
      const fixedAnimationDuration = 200; // 400 / 2 = 200ms (2x speed)
      setTimeout(() => {
        isAnimating = false;
        enableNavigationButtons();
        
        // Reset cooldown after a delay to prevent rapid pressing
        setTimeout(() => {
          buttonCooldown = false;
          document.getElementById("prev-btn").classList.remove("btn-cooldown");
          document.getElementById("next-btn").classList.remove("btn-cooldown");
        }, 250); // Cooldown period after animation completes
      }, fixedAnimationDuration);
    }
    
    // Right arrow key for next step
    if (event.key === "ArrowRight" && currentStep < logData.length) {
      event.preventDefault()
      
      if (isPlaying) {
        stopAnimation();
      }
      
      // Set cooldown to prevent rapid pressing
      buttonCooldown = true;
      
      // Add visual indication of cooldown
      document.getElementById("prev-btn").classList.add("btn-cooldown");
      document.getElementById("next-btn").classList.add("btn-cooldown");
      
      currentStep++;
      isAnimating = true;
      disableNavigationButtons();
      updateVisualization();
      
      // Fixed animation duration at 2x speed (half the base duration)
      const fixedAnimationDuration = 200; // 400 / 2 = 200ms (2x speed)
      setTimeout(() => {
        isAnimating = false;
        enableNavigationButtons();
        
        // Reset cooldown after a delay to prevent rapid pressing
        setTimeout(() => {
          buttonCooldown = false;
          document.getElementById("prev-btn").classList.remove("btn-cooldown");
          document.getElementById("next-btn").classList.remove("btn-cooldown");
        }, 250); // Cooldown period after animation completes
      }, fixedAnimationDuration);
    }
    
    // Up arrow key to increase animation speed
    if (event.key === "ArrowUp") {
      event.preventDefault();
      increaseAnimationSpeed();
    }
    
    // Down arrow key to decrease animation speed
    if (event.key === "ArrowDown") {
      event.preventDefault();
      decreaseAnimationSpeed();
    }
    
    // Spacebar for play/pause
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault()
      togglePlay()
    }
    
    // 'r' key for reset
    if (event.key === "r" || event.key === "R") {
      event.preventDefault()
      resetGraph();
    }
  })

  // Handle window resize
  window.addEventListener("resize", () => {
    // Redraw timeline
    initTimeline()

    // Update timeline marker
    updateTimelineMarker()
  })
}

/**
 * Automatically start the animation after a short delay
 */
function autoStartAnimation() {
  // Function kept for compatibility with shared URLs, but not used for uploads
  setTimeout(() => {
    // Animation autostart disabled for uploads
    // togglePlay();
  }, 150);
}

/**
 * Initialize the application
 */
function initApp() {
  console.log("Initializing application...")

  // Check for shared data in URL first
  const urlParams = new URLSearchParams(window.location.search)
  const hasSharedData = urlParams.has("data") || urlParams.has("logs") || urlParams.has("log")

  // Initialize theme
  initTheme()

  // Check if D3.js is available
  if (!checkD3Availability()) {
    document.getElementById(
      "loading"
    ).innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> D3.js is not loaded. Please check your internet connection and reload the page.</div>`
    return
  }

  // Setup event listeners
  setupEventListeners()

  // Initialize the upload feature
  initUploadFeature()
    
  // Initialize the share feature
  initShareFeature()
  
  // Set initial animation speed
  updateAnimationSpeedDisplay()

  if (hasSharedData) {
    // Process shared data
    checkForSharedScenario()
  } else if (!isFileUploaded) {
    // No data to display, show welcome screen
    showWelcomeScreen()
  }
}

// Start the application when the DOM is loaded
document.addEventListener("DOMContentLoaded", initApp)

/**
 * Show a welcome message when no logs are loaded
 */
function showWelcomeScreen() {
  const loading = document.getElementById("loading")
  loading.innerHTML = `
    <div class="welcome-message">
        <img src="img/mini-logo.png" alt="Deloxide Logo" class="welcome-logo">
        <h2>Welcome to Deloxide</h2>
        <p>A visualization tool for understanding deadlock detection in operating systems.</p>
        <p>To get started, upload a Deloxide log file by clicking the Upload button in the top-right corner.</p>
    </div>`
  loading.style.display = "block"

  // Hide visualization elements until data is loaded
  document.getElementById("controls").style.display = "none"
  document.getElementById("graph").style.display = "none"
  document.getElementById("timeline").style.display = "none"
  document.getElementById("legend").style.display = "none"
  
  // Hide the visualization container
  const visualizationContainer = document.querySelector(".visualization-container")
  if (visualizationContainer) {
    visualizationContainer.style.display = "none"
  }
}

// Function to show all visualization elements
function showVisualizationElements() {
  // Show the visualization container first
  const visualizationContainer = document.querySelector(".visualization-container")
  if (visualizationContainer) {
    visualizationContainer.style.display = "flex"
  }
  
  // Show all visualization elements
  document.getElementById("loading").style.display = "none"
  document.getElementById("graph").style.display = "block"
  document.getElementById("step-info").style.display = "block"
  document.getElementById("wait-graph").style.display = "block"
  document.getElementById("timeline").style.display = "block"
  document.getElementById("controls").style.display = "flex"
  document.getElementById("legend").style.display = "block"
}

/**
 * Utility functions for modal animations
 */
function showModalWithAnimation(modal) {
  // Get the modal content element
  const modalContent = modal.querySelector('.modal-content');
  
  // Reset any existing animations
  modalContent.classList.remove('modal-fade-in', 'modal-fade-out');
  
  // Show the modal first
  modal.style.display = 'flex';
  
  // Add the new animation class
  modalContent.classList.add('modal-fade-in');
}

function hideModalWithAnimation(modal) {
  // Get the modal content element
  const modalContent = modal.querySelector('.modal-content');
  
  // Reset any existing animations
  modalContent.classList.remove('modal-fade-in', 'modal-fade-out');
  
  // Add the fade out animation
  modalContent.classList.add('modal-fade-out');
  
  // Hide the modal after animation completes
  setTimeout(() => {
    modal.style.display = 'none';
  }, 80); // 80ms animation duration - daha hızlı
}

/**
 * Helper function to stop animation and reset controls
 */
function stopAnimation() {
  clearInterval(animationInterval);
  isPlaying = false;
  const playBtn = document.getElementById("play-btn");
  const playBtnText = playBtn.querySelector("span");
  const playBtnIcon = playBtn.querySelector("i");
  playBtnText.textContent = "Play";
  playBtnIcon.className = "fas fa-play";
}

// Toast notification system
function showToast(message, type = 'info', duration = 5000) {
  // Create toast container if it doesn't exist
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Get the appropriate icon based on type
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';
  if (type === 'warning') icon = 'fa-exclamation-triangle';
  
  // Set toast content
  toast.innerHTML = `
    <i class="fas ${icon} toast-icon"></i>
    <div class="toast-content">${message}</div>
    <button class="toast-close">&times;</button>
  `;
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Setup close button functionality
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent click from bubbling to toast
    toast.style.animation = 'toast-out 0.3s forwards';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  });
  
  // Toggle expanded state when toast is clicked
  toast.addEventListener('click', (e) => {
    if (e.target !== closeBtn) {
      toast.classList.toggle('expanded');
      
      // Adjust other toasts when one is expanded
      if (toast.classList.contains('expanded')) {
        const allToasts = document.querySelectorAll('.toast');
        allToasts.forEach(t => {
          if (t !== toast && t.classList.contains('expanded')) {
            t.classList.remove('expanded');
          }
        });
      }
    }
  });
  
  // Auto-dismiss after duration
  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'toast-out 0.3s forwards';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }
    }, duration);
  }
  
  return toast;
}

// Add a function to reset the graph
function resetGraph() {
  // Don't allow reset while animating
  if (isAnimating) return;
  
  // Stop animation if it's playing
  if (isPlaying) {
    stopAnimation();
  }

  // Reset to first step
  currentStep = 1
  
  // Reset animation speed to default
  animationSpeed = 1.0
  updateAnimationSpeedDisplay()

  // Reset and redraw the visualization
  resetVisualization()
  initVisualization()
  initTimeline()
  updateVisualization()
  
  // Show a toast notification
  showToast("Visualization reset to initial state", "info", 2000);
}

/**
 * Increase animation speed by 0.25 (faster animation)
 */
function increaseAnimationSpeed() {
  // Cap the maximum speed at 2.0
  if (animationSpeed < 2.0) {
    // Stop any ongoing animation first
    if (isPlaying) {
      stopAnimation();
    }
    
    animationSpeed += 0.25;
    updateAnimationSpeedDisplay();
    showToast(`Animation speed: ${animationSpeed.toFixed(2)}x`, "info", 1500);
  }
}

/**
 * Decrease animation speed by 0.25 (slower animation)
 */
function decreaseAnimationSpeed() {
  // Minimum speed of 0.25
  if (animationSpeed > 0.25) {
    // Stop any ongoing animation first
    if (isPlaying) {
      stopAnimation();
    }
    
    animationSpeed -= 0.25;
    updateAnimationSpeedDisplay();
    showToast(`Animation speed: ${animationSpeed.toFixed(2)}x`, "info", 1500);
  }
}

/**
 * Update the animation speed display in the button text
 */
function updateAnimationSpeedDisplay() {
  const speedUpBtn = document.getElementById("speed-up-btn");
  const speedDownBtn = document.getElementById("speed-down-btn");
  
  if (speedUpBtn && speedDownBtn) {
    // Update tooltips or other indicators if needed
    speedUpBtn.setAttribute("title", `Current speed: ${animationSpeed.toFixed(2)}x`);
    speedDownBtn.setAttribute("title", `Current speed: ${animationSpeed.toFixed(2)}x`);
  }
}

/**
 * Modal Functionality
 * Handles opening and closing modals with animations
 */

// Modal animation utility functions
function showModalWithAnimation(modal) {
    modal.style.display = 'flex';
    // Small delay needed for the transition to work properly
    setTimeout(() => {
        modal.classList.add('active');
        modal.querySelector('.modal-content').classList.add('show');
    }, 10);
}

function hideModalWithAnimation(modal) {
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.remove('show');
    setTimeout(() => {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }, 200);
}

// Initialize modals when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Modal handling
    const modals = document.querySelectorAll('.modal');
    const closeButtons = document.querySelectorAll('.modal-close');
    const helpToggle = document.querySelector('.help-toggle');
    const uploadBtn = document.getElementById('upload-btn');
    const shareBtn = document.getElementById('share-btn');
    
    // Close modal when clicking outside of it
    modals.forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                hideModalWithAnimation(modal);
            }
        });
    });
    
    // Close modal with close button
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            hideModalWithAnimation(modal);
        });
    });
    
    // Open help modal
    if (helpToggle) {
        helpToggle.addEventListener('click', function(e) {
            e.preventDefault();
            showModalWithAnimation(document.getElementById('help-modal'));
        });
    }
    
    // Close modals with ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            modals.forEach(modal => {
                if (modal.classList.contains('active')) {
                    hideModalWithAnimation(modal);
                }
            });
        }
    });
});

// Function to show visual feedback when buttons are in cooldown
function showButtonCooldownFeedback(button) {
  button.classList.add("btn-cooldown-feedback");
  setTimeout(() => {
    button.classList.remove("btn-cooldown-feedback");
  }, 300);
}
