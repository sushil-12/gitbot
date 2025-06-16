import inquirer from 'inquirer';

async function runTest() {
  console.log("Starting inquirer input test...");
  try {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'testInput',
        message: 'Enter some test input:',
      },
    ]);
    console.log("Inquirer prompt completed. Answers:", answers);
    if (answers && answers.testInput) {
      console.log(`You entered: "${answers.testInput}"`);
    } else {
      console.log("No input received or answers object is unexpected.");
    }
  } catch (error) {
    console.error("Error during inquirer test:", error);
  }
  console.log("Inquirer input test finished.");
}

runTest();