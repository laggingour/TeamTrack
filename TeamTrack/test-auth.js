
const { hashPassword, verifyPassword } = require('./auth');

async function testAuth() {
  const password = 'PulseTest123!';

  const hashedPassword = await hashPassword(password);

  console.log('Password hashed:', hashedPassword.startsWith('$2b$12$'));

  const correctPassword = await verifyPassword(
    password,
    hashedPassword
  );

  const incorrectPassword = await verifyPassword(
    'WrongPassword123!',
    hashedPassword
  );

  console.log('Correct password accepted:', correctPassword);
  console.log('Wrong password rejected:', !incorrectPassword);
}

testAuth().catch(console.error);
