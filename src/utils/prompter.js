import inquirer from 'inquirer';
import logger from './logger.js';

const serviceName = 'Prompter';

/**
 * Asks a yes/no question to the user.
 * @param {string} message - The question to ask.
 * @param {boolean} defaultValue - The default value (true for yes, false for no).
 * @returns {Promise<boolean>} True if the user answers yes, false otherwise.
 */
export async function askYesNo(message, defaultValue = false) {
  try {
    const { answer } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'answer',
        message: message,
        default: defaultValue,
      },
    ]);
    return answer;
  } catch (e) {
    console.error(`[${serviceName}] RAW ERROR in askYesNo:`, e);
    // Fall back to the default value or a safe option
    return defaultValue;
  }
}

/**
 * Asks the user for text input.
 * @param {string} message - The message/question to display.
 * @param {string} [defaultValue] - (Optional) The default value for the input.
 * @param {function} [validate] - (Optional) A function to validate the input.
 *                                 Should return true if valid, or an error message string if invalid.
 * @returns {Promise<string|null>} The user's input, or null if an error occurs or input is empty and not allowed.
 */
export async function askForInput(message, defaultValue, validate) {
  console.log(`[Prompter DEBUG] askForInput called with message: "${message}"`);
  return inquirer.prompt([
    {
      type: 'input',
      name: 'input',
      message: message,
      default: defaultValue,
      validate: validate,
    },
  ])
  .then(answers => {
    console.log(`[Prompter DEBUG] askForInput - inquirer.prompt resolved. Answers:`, answers);
    return answers.input;
  })
  .catch(e => {
    // This catch is directly on the inquirer promise.
    console.error(`[${serviceName}] RAW ERROR from inquirer.prompt in askForInput:`, e);
    // logger.error('Error during input prompt (direct catch):', { message: e.message, stack: e.stack, service: serviceName });
    return null; // Or handle error more specifically
  });
}

/**
 * Asks the user to choose from a list of options.
 * @param {string} message - The message/question to display.
 * @param {Array<string|object>} choices - An array of choices. Can be strings or objects {name, value}.
 * @param {string} [defaultValue] - (Optional) The default selected value.
 * @returns {Promise<string|null>} The selected value, or null if an error occurs.
 */
export async function askForChoice(message, choices, defaultValue) {
    try {
        const { selection } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selection',
                message: message,
                choices: choices,
                default: defaultValue,
            },
        ]);
        return selection;
    } catch (e) {
        console.error(`[${serviceName}] RAW ERROR in askForChoice:`, e);
        return null;
    }
}

// Example usage (can be removed or kept for testing)
// async function testPrompts() {
//   const init = await askYesNo('Initialize a new repo?', true);
//   console.log('Init repo:', init);

//   if (init) {
//     const repoName = await askForInput('Enter repo name:', 'my-new-project', (value) => {
//       if (value.length < 3) return 'Name must be at least 3 characters.';
//       return true;
//     });
//     console.log('Repo name:', repoName);

//     const choice = await askForChoice('Choose a remote type:', ['github', 'gitlab', 'bitbucket'], 'github');
//     console.log('Remote type:', choice);
//   }
// }
// testPrompts();