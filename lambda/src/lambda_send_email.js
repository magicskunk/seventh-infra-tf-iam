import {IAMClient, ListUserTagsCommand, UpdateLoginProfileCommand} from "@aws-sdk/client-iam";
import {SendEmailCommand, SESClient} from "@aws-sdk/client-ses";
import {generate as generatePwd} from 'generate-password';
import {readFile} from 'fs/promises';

const region = 'eu-central-1';
const fromEmail = 'mail@karambol.dev';

const parseHtml = async (filePath, variables) => {
  const html = await readFile(filePath, {encoding: 'utf8'});
  return variables.reduce(
    (acc, it) => replace(acc, `#${it.name}#`, it.value), html
  );
}

const replace = (original, searchTxt, replaceTxt) => {
  const regex = new RegExp(searchTxt, 'g');
  return original.replace(regex, replaceTxt);
}

const run = async (event) => {
  console.log('Event: ', event);

  const iam = new IAMClient({});
  const ses = new SESClient({region: region});

  const username = event.detail.requestParameters.userName;
  const accountId = event.detail.userIdentity.accountId;

  if (!username) {
    console.error('invalid event payload, does not contain username param')
    return;
  }

  if (!accountId) {
    console.error('invalid event payload, does not contain accountId param')
    return;
  }

  try {
    const user = await iam.send(new ListUserTagsCommand({UserName: username}));
    console.log('User: ', user);
    const email = user.Tags.find(it => it.Key === 'email')?.Value;
    const pwd = generatePwd({
      length: 20, numbers: true, symbols: true, strict: true, excludeSimilarCharacters: true, exclude: '`'
    })
    console.log(`pwd: ${pwd}`);
    await iam.send(new UpdateLoginProfileCommand(
      {UserName: username, Password: pwd, PasswordResetRequired: true}
    ));

    const html = await parseHtml('account_created.html', [
      {name: 'accountId', value: accountId},
      {name: 'username', value: username},
      {name: 'pwd', value: pwd}
    ]);
    const sendEmailCommand = new SendEmailCommand({
      Destination: {CcAddresses: [], ToAddresses: [email]},
      Message: {
        Body: {Html: {Charset: "UTF-8", Data: html}},
        Subject: {Charset: "UTF-8", Data: "Magicskunk - AWS account",}
      },
      Source: fromEmail
    });
    console.log('Recipient email: ', email);
    console.log('Send email command: ', sendEmailCommand);
    return await ses.send(sendEmailCommand);
  } catch (err) {
    console.error(err)
    return err;
  }
}

export {run};