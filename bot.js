const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const https = require("https");

// Initialize Telegram Bot
const TOKEN = "8146573794:AAGcGkQbjemK6JSSiEasV3dsljz0MO38kKg"; // Replace with your bot token
const bot = new TelegramBot(TOKEN, { polling: true });

// File paths
const PDFS_DIR = "pdfs";
const ANSWERS_JSON = "answers.json";
const IDS_JSON = "ids.json";

// Channel ID (replace with your channel ID)
const CHANNEL_ID = "@itechnic_me_group"; // Example: "@myquizchannel"

// Admin user IDs (replace with your admin IDs)
const ADMINS = [123456789, 563429481]; // Replace with actual admin user IDs

// Ensure directories and files exist
if (!fs.existsSync(PDFS_DIR)) {
    fs.mkdirSync(PDFS_DIR);
    console.log(`Created directory: ${PDFS_DIR}`);
}
if (!fs.existsSync(ANSWERS_JSON)) {
    fs.writeFileSync(ANSWERS_JSON, JSON.stringify({}));
    console.log(`Created file: ${ANSWERS_JSON}`);
}
if (!fs.existsSync(IDS_JSON)) {
    fs.writeFileSync(IDS_JSON, JSON.stringify({}));
    console.log(`Created file: ${IDS_JSON}`);
}

// Function: Sanitize file name
function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_"); // Replace invalid characters with underscores
}

// Function: Save data to JSON file
function saveToJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Data saved to ${filePath}`);
}

// Function: Read data from JSON file
function readFromJson(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath));
    console.log(`Data read from ${filePath}`);
    return data;
}

// Function: Download file from URL
function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading file from URL: ${url}`);
        const fileStream = fs.createWriteStream(filePath);
        https.get(url, (response) => {
            response.pipe(fileStream);
            fileStream.on("finish", () => {
                console.log(`File downloaded successfully: ${filePath}`);
                resolve(filePath);
            });
            fileStream.on("error", (error) => {
                console.error(`Error downloading file: ${error.message}`);
                reject(error);
            });
        }).on("error", (error) => {
            console.error(`Error with HTTPS request: ${error.message}`);
            reject(error);
        });
    });
}

// Function: Check if user is an admin
function isAdmin(userId) {
    return ADMINS.includes(userId);
}

// Function: Check if user has joined the channel
async function hasJoinedChannel(userId) {
    try {
        const member = await bot.getChatMember(CHANNEL_ID, userId);
        return member.status === "member" || member.status === "administrator" || member.status === "creator";
    } catch (error) {
        console.error(`Error checking channel membership: ${error.message}`);
        return false;
    }
}

// Command: Start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`/start command received from chatId: ${chatId}`);
    bot.sendMessage(
        chatId,
        "🌟 Welcome to the Quiz Bot! 🌟\n\n" +
        "Use /upload_test to upload a test or /work_test to take a test."
    );
});

// Command: Upload Test
bot.onText(/\/upload_test/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`/upload_test command received from chatId: ${chatId}`);

    // Step 1: Ask for the test name
    bot.sendMessage(chatId, "📝 Please enter a name for the test:");
    bot.once("message", (nameMsg) => {
        const testName = sanitizeFileName(nameMsg.text.trim());
        console.log(`Test name received: ${testName}`);

        // Step 2: Ask for the number of questions
        bot.sendMessage(chatId, "🔢 How many questions are in the test?");
        bot.once("message", (numMsg) => {
            const numQuestions = parseInt(numMsg.text.trim());
            console.log(`Number of questions received: ${numQuestions}`);

            if (isNaN(numQuestions)) {
                console.error(`Invalid number of questions: ${numMsg.text}`);
                bot.sendMessage(chatId, "❌ Please enter a valid number.");
                return;
            }

            // Step 3: Ask for the PDF file
            bot.sendMessage(chatId, "📤 Please upload the PDF file for the test.");
            bot.once("document", async (docMsg) => {
                try {
                    const fileId = docMsg.document.file_id;
                    console.log(`File ID received: ${fileId}`);

                    const filePath = path.join(PDFS_DIR, `${testName}.pdf`);
                    console.log(`File path: ${filePath}`);

                    // Download the file
                    const fileLink = await bot.getFileLink(fileId);
                    console.log(`File link generated: ${fileLink}`);

                    if (!fileLink || !fileLink.startsWith("http")) {
                        throw new Error("Invalid file link received from Telegram API.");
                    }

                    await downloadFile(fileLink, filePath);

                    // Step 4: Ask for answer input method
                    bot.sendMessage(chatId, "📝 How would you like to enter the answers?", {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "Inline (underscore-separated)", callback_data: `inline_${testName}_${numQuestions}` }],
                                [{ text: "One by one", callback_data: `onebyone_${testName}_${numQuestions}` }],
                            ],
                        },
                    });
                } catch (error) {
                    console.error(`Error handling PDF: ${error.message}`);
                    bot.sendMessage(chatId, `❌ Error handling PDF: ${error.message}`);
                }
            });
        });
    });
});

// Handle answer input method selection for /upload_test
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith("inline_")) {
        const [method, testName, numQuestions] = data.split("_");
        console.log(`Inline answer method selected for test: ${testName}, numQuestions: ${numQuestions}`);

        // Ask for inline answers
        bot.sendMessage(chatId, `📝 Please enter the correct answers in the format \`a_b_c_d\` for ${numQuestions} questions:`);
        bot.once("message", (answersMsg) => {
            let answers = answersMsg.text.trim();

            // Normalize input: Replace commas with underscores
            answers = answers.replace(/,/g, "_");

            // Split answers by underscores
            answers = answers.split("_");
            console.log(`Inline answers received: ${answers}`);

            if (answers.length !== parseInt(numQuestions)) {
                console.error(`Invalid number of answers: ${answers.length}`);
                bot.sendMessage(chatId, `❌ Please enter exactly ${numQuestions} answers.`);
                return;
            }

            // Save answers to answers.json
            const answersData = readFromJson(ANSWERS_JSON);
            answersData[testName] = answers;
            saveToJson(ANSWERS_JSON, answersData);

            bot.sendMessage(chatId, `✅ Test '${testName}' uploaded successfully!`);
        });
    } else if (data.startsWith("onebyone_")) {
        const [method, testName, numQuestions] = data.split("_");
        console.log(`One-by-one answer method selected for test: ${testName}, numQuestions: ${numQuestions}`);

        // Ask for answers one by one
        const answers = [];
        askAnswerOneByOne(chatId, testName, numQuestions, 1, answers);
    }
});

// Function: Ask for answers one by one
function askAnswerOneByOne(chatId, testName, numQuestions, currentQuestion, answers) {
    console.log(`Asking for answer to question ${currentQuestion}`);
    bot.sendMessage(chatId, `📝 Please enter the correct answer for question ${currentQuestion}:`);
    bot.once("message", (answerMsg) => {
        const answer = answerMsg.text.trim();
        console.log(`Answer received for question ${currentQuestion}: ${answer}`);
        answers.push(answer);

        if (currentQuestion < numQuestions) {
            askAnswerOneByOne(chatId, testName, numQuestions, currentQuestion + 1, answers);
        } else {
            // Save answers to answers.json
            const answersData = readFromJson(ANSWERS_JSON);
            answersData[testName] = answers;
            saveToJson(ANSWERS_JSON, answersData);

            bot.sendMessage(chatId, `✅ Test '${testName}' uploaded successfully!`);
        }
    });
}

// Command: Delete Test
bot.onText(/\/delete_test/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log(`/delete_test command received from chatId: ${chatId}, userId: ${userId}`);

    // Check if the user is an admin
    if (!isAdmin(userId)) {
        bot.sendMessage(chatId, "❌ You are not authorized to delete tests.");
        return;
    }

    // Read available tests from answers.json
    const answersData = readFromJson(ANSWERS_JSON);
    const tests = Object.keys(answersData);

    if (tests.length === 0) {
        bot.sendMessage(chatId, "❌ No tests available to delete.");
        return;
    }

    // Create a list of buttons for available tests
    const testButtons = tests.map((test) => [{ text: test, callback_data: `delete_${test}` }]);
    bot.sendMessage(chatId, "🗑️ Choose a test to delete:", {
        reply_markup: {
            inline_keyboard: testButtons,
        },
    });
});

// Handle delete test selection
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    if (data.startsWith("delete_")) {
        const testName = data.replace("delete_", "");
        console.log(`Test selected for deletion: ${testName}`);

        // Check if the user is an admin
        if (!isAdmin(userId)) {
            bot.sendMessage(chatId, "❌ You are not authorized to delete tests.");
            return;
        }

        // Delete the test PDF
        const filePath = path.join(PDFS_DIR, `${testName}.pdf`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted PDF: ${filePath}`);
        }

        // Delete the test answers
        const answersData = readFromJson(ANSWERS_JSON);
        delete answersData[testName];
        saveToJson(ANSWERS_JSON, answersData);

        // Delete the test scores
        const idsData = readFromJson(IDS_JSON);
        delete idsData[testName];
        saveToJson(IDS_JSON, idsData);

        bot.sendMessage(chatId, `✅ Test '${testName}' deleted successfully!`);
    }
});

// Command: Work Test
bot.onText(/\/work_test/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log(`/work_test command received from chatId: ${chatId}, userId: ${userId}`);

    // Check if the user has joined the channel
    const isMember = await hasJoinedChannel(userId);
    if (!isMember) {
        bot.sendMessage(
            chatId,
            `❌ You must join the channel ${CHANNEL_ID} to take tests.\n\n` +
            `Click here to join: https://t.me/${CHANNEL_ID.replace("@", "")}`
        );
        return;
    }

    // Read available tests from answers.json
    const answersData = readFromJson(ANSWERS_JSON);
    const tests = Object.keys(answersData);

    if (tests.length === 0) {
        console.error("No tests available.");
        bot.sendMessage(chatId, "❌ No tests available. Please upload a test first.");
        return;
    }

    // Create a list of buttons for available tests
    const testButtons = tests.map((test) => [{ text: test, callback_data: `select_test_${test}` }]);
    bot.sendMessage(chatId, "📚 Choose a test to work on:", {
        reply_markup: {
            inline_keyboard: testButtons,
        },
    });
});

// Handle test selection for /work_test
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith("select_test_")) {
        const testName = data.replace("select_test_", "");
        console.log(`Test selected: ${testName}`);

        // Send the chosen test PDF
        const filePath = path.join(PDFS_DIR, `${testName}.pdf`);
        console.log(`Sending PDF: ${filePath}`);
        bot.sendDocument(chatId, filePath);

        // Ask for answer input method
        bot.sendMessage(chatId, "📝 How would you like to enter your answers?", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Inline (underscore-separated)", callback_data: `work_inline_${testName}` }],
                    [{ text: "One by one", callback_data: `work_onebyone_${testName}` }],
                ],
            },
        });
    } else if (data.startsWith("work_inline_")) {
        const testName = data.replace("work_inline_", "");
        console.log(`Inline answer method selected for test: ${testName}`);

        // Ask for inline answers
        bot.sendMessage(chatId, `📝 Please enter your answers for '${testName}' in the format \`a_b_c_d\`:`);
        bot.once("message", (answersMsg) => {
            let userAnswers = answersMsg.text.trim();

            // Normalize input: Replace commas with underscores
            userAnswers = userAnswers.replace(/,/g, "_");

            // Split answers by underscores
            userAnswers = userAnswers.split("_");
            console.log(`User answers received: ${userAnswers}`);

            // Get correct answers
            const answersData = readFromJson(ANSWERS_JSON);
            const correctAnswers = answersData[testName];

            if (!correctAnswers) {
                console.error(`No correct answers found for test: ${testName}`);
                bot.sendMessage(chatId, `❌ No correct answers found for '${testName}'.`);
                return;
            }

            // Compare answers
            let correctCount = 0;
            let incorrectCount = 0;
            for (let i = 0; i < Math.min(userAnswers.length, correctAnswers.length); i++) {
                if (userAnswers[i] === correctAnswers[i]) {
                    correctCount++;
                } else {
                    incorrectCount++;
                }
            }

            // Save user ID and score
            const userId = answersMsg.from.id;
            const userName = answersMsg.from.first_name || "Unknown User";
            const idsData = readFromJson(IDS_JSON);

            if (!idsData[testName]) {
                idsData[testName] = {};
            }

            idsData[testName][userId] = {
                name: userName,
                correct: correctCount,
                incorrect: incorrectCount,
            };

            saveToJson(IDS_JSON, idsData);
            console.log(`User ${userName} (ID: ${userId}) scored ${correctCount} correct answers for test '${testName}'.`);

            // Send results
            bot.sendMessage(
                chatId,
                `📊 Your answers: ${userAnswers.join(", ")}\n` +
                `📝 Results for '${testName}':\n` +
                `✅ Correct: ${correctCount}\n` +
                `❌ Incorrect: ${incorrectCount}`
            );
        });
    } else if (data.startsWith("work_onebyone_")) {
        const testName = data.replace("work_onebyone_", "");
        console.log(`One-by-one answer method selected for test: ${testName}`);

        // Ask for answers one by one
        const userAnswers = [];
        askUserAnswerOneByOne(chatId, testName, 1, userAnswers);
    }
});

// Function: Ask for user answers one by one
function askUserAnswerOneByOne(chatId, testName, currentQuestion, userAnswers) {
    console.log(`Asking for user answer to question ${currentQuestion}`);
    bot.sendMessage(chatId, `📝 Please enter your answer for question ${currentQuestion}:`);
    bot.once("message", (answerMsg) => {
        const answer = answerMsg.text.trim();
        console.log(`User answer received for question ${currentQuestion}: ${answer}`);
        userAnswers.push(answer);

        // Get correct answers
        const answersData = readFromJson(ANSWERS_JSON);
        const correctAnswers = answersData[testName];

        if (!correctAnswers) {
            console.error(`No correct answers found for test: ${testName}`);
            bot.sendMessage(chatId, `❌ No correct answers found for '${testName}'.`);
            return;
        }

        if (currentQuestion < correctAnswers.length) {
            askUserAnswerOneByOne(chatId, testName, currentQuestion + 1, userAnswers);
        } else {
            // Compare answers
            let correctCount = 0;
            let incorrectCount = 0;
            for (let i = 0; i < Math.min(userAnswers.length, correctAnswers.length); i++) {
                if (userAnswers[i] === correctAnswers[i]) {
                    correctCount++;
                } else {
                    incorrectCount++;
                }
            }

            // Save user ID and score
            const userId = answerMsg.from.id;
            const userName = answerMsg.from.first_name || "Unknown User";
            const idsData = readFromJson(IDS_JSON);

            if (!idsData[testName]) {
                idsData[testName] = {};
            }

            idsData[testName][userId] = {
                name: userName,
                correct: correctCount,
                incorrect: incorrectCount,
            };

            saveToJson(IDS_JSON, idsData);
            console.log(`User ${userName} (ID: ${userId}) scored ${correctCount} correct answers for test '${testName}'.`);

            // Send results
            bot.sendMessage(
                chatId,
                `📊 Your answers: ${userAnswers.join(", ")}\n` +
                `📝 Results for '${testName}':\n` +
                `✅ Correct: ${correctCount}\n` +
                `❌ Incorrect: ${incorrectCount}`
            );
        }
    });
}

// Command: Leaderboard
bot.onText(/\/leaderboard/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`/leaderboard command received from chatId: ${chatId}`);

    // Read available tests from answers.json
    const answersData = readFromJson(ANSWERS_JSON);
    const tests = Object.keys(answersData);

    if (tests.length === 0) {
        console.error("No tests available.");
        bot.sendMessage(chatId, "❌ No tests available. Please upload a test first.");
        return;
    }

    // Create a list of buttons for available tests
    const testButtons = tests.map((test) => [{ text: test, callback_data: `leaderboard_${test}` }]);
    bot.sendMessage(chatId, "🏆 Choose a test to view the leaderboard:", {
        reply_markup: {
            inline_keyboard: testButtons,
        },
    });
});

// Handle leaderboard selection
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const testName = query.data.replace("leaderboard_", "");
    console.log(`Leaderboard selected for test: ${testName}`);

    // Read user scores for the selected test
    const idsData = readFromJson(IDS_JSON);
    const testScores = idsData[testName];

    if (!testScores) {
        console.error(`No scores available for test: ${testName}`);
        bot.sendMessage(chatId, `❌ No scores available for '${testName}'.`);
        return;
    }

    // Convert scores to an array and sort by correct answers (descending)
    const scoresArray = Object.entries(testScores).map(([userId, data]) => ({
        name: data.name,
        correct: data.correct,
        incorrect: data.incorrect,
    }));

    scoresArray.sort((a, b) => b.correct - a.correct);

    // Prepare leaderboard message
    let leaderboardMessage = `🏆 Leaderboard for '${testName}' 🏆\n\n`;
    scoresArray.forEach((user, index) => {
        leaderboardMessage += `${index + 1}. ${user.name} - ✅ ${user.correct} | ❌ ${user.incorrect}\n`;
    });

    bot.sendMessage(chatId, leaderboardMessage);
});