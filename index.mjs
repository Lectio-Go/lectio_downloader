import {
  hentOpgaver,
  detailedOpgaver,
  AuthenticatedUser,
  NodeRequest,
  GetAllSchools,
} from "liblectio";
import request from "request";
import fs from "fs";
import prompts from "prompts";
import { exit } from "process";
import cliProgress from 'cli-progress'
import _colors from 'colors';

// 1. Setup basic LibLectio API helpers
let apiHelper = new NodeRequest();
let downloadHelper = new NodeRequest();
downloadHelper.GetLectio = async (url) => {
  return new Promise(async (resolve, reject) => {
    request.get(
      {
        url: url,
        jar: true,
        encoding: null,
      },
      (err, res) => {
        if (err) reject(err);
        if (res && res.body && res.headers)
          resolve({ data: res.body, headers: res.headers });
        else resolve({ data: Buffer.from(""), headers: {} });
      }
    );
  });
};

// 2. Prompt user for credentials. Keep retrying if login fails
let [username, password, schoolid] = await promptCredentials();
let user = new AuthenticatedUser(username, password, schoolid);

try {
  await user.Authenticate(apiHelper);
} catch (error) {
  console.log(error)
  console.log(" ")

  let response = await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Do you want to try again?',
    initial: true
  });

  if(!response.value)
    exit()
}

while(!user.isAuthenticated) {
  [username, password, schoolid] = await promptCredentials();
  user = new AuthenticatedUser(username, password, schoolid);
  try {
    await user.Authenticate(apiHelper);
  } catch (error) {
    console.log(error)
    console.log(" ")
  
    let response = await prompts({
      type: 'confirm',
      name: 'value',
      message: 'Do you want to try again?',
      initial: true
    });
  
    if(!response.value)
      exit()
  }
}

// 3. Start downloading opgaver
const b1 = new cliProgress.SingleBar({
  format: 'Downloader opgaver: |' + _colors.cyan('{bar}') + '| {percentage}% || {value}/{total}',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});

let opgaveList = await hentOpgaver(user, apiHelper);
b1.start(opgaveList.length, 0);

createDir("Opgaver");

for (let opgave of opgaveList) {
  // Fetch each opgave
  let detailedOpgave = await detailedOpgaver(user, apiHelper, opgave.id);

  createDir("./Opgaver/" + opgave.opgavetitel);

  fs.writeFile(
    "./Opgaver/" + opgave.opgavetitel + "/simple_metadata.json",
    JSON.stringify(opgave, null, 4),
    (err) => {}
  );

  fs.writeFile(
    "./Opgaver/" + opgave.opgavetitel + "/detailed_metadata.json",
    JSON.stringify(detailedOpgave, null, 4),
    (err) => {}
  );

  if (detailedOpgave.opgavebeskrivelse) {
    try {
      let file = await downloadHelper.GetLectio(
        detailedOpgave.opgavebeskrivelse.url
      );
      fs.writeFile(
        "./Opgaver/" +
          opgave.opgavetitel +
          "/Opgave_" +
          detailedOpgave.opgavebeskrivelse.navn,
        Buffer.from(file.data, "binary"),
        (err) => {}
      );
    } catch (error) {
      console.log("ERROR: " + error);
    }
  }

  for (let indlæg of detailedOpgave.indlæg) {
    try {
      let file = await downloadHelper.GetLectio(indlæg.dokument.url);
      fs.writeFile(
        "./Opgaver/" + opgave.opgavetitel + "/" + indlæg.dokument.navn,
        Buffer.from(file.data, "binary"),
        (err) => {}
      );
    } catch (error) {
      // console.log("ERROR: " + error);
    }
  }
  b1.increment();
}
b1.stop();


function createDir(path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, {
      recursive: true,
    });
  }
}

async function promptCredentials() {
  const questions = [
    {
      type: "text",
      name: "username",
      message: "What is your Lectio username?",
    },
    {
      type: "password",
      name: "password",
      message: "What is your Lectio password?",
    },
    {
      type: "autocomplete",
      name: "schoolid",
      message: "What school do you attend?",
      choices: (await GetAllSchools()).map((school) => {
        return {
          title: school.name + "(" + school.id + ")",
          value: school.id,
        };
      }),
    },
  ];

  const response = await prompts(questions);
  return [response.username, response.password, response.schoolid];
}