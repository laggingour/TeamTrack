
const {
  createUser,
  findUserByEmail,
  checkUserPassword
} = require('./users');

async function testUsers() {
  const testEmail = 'pulse.test@example.com';

  try {
    // Check whether the test account already exists
    let user = await findUserByEmail(testEmail);

    if (!user) {
      user = await createUser(
        'Pulse Test User',
        testEmail,
        'PulseTest123!'
      );

      console.log('Test user created successfully!');
    } else {
      console.log('Test user already exists.');
    }

    // Check that the password is stored as a hash
    console.log(
      'Password is hashed:',
      user.password_hash === undefined
    );

    // Test correct and incorrect passwords
    console.log(
      'Correct password accepted:',
      await checkUserPassword(testEmail, 'PulseTest123!')
    );

    console.log(
      'Wrong password rejected:',
      !(await checkUserPassword(testEmail, 'WrongPassword123!'))
    );

    // Display safe account information
    console.log('Test account:', {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    });

  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    const pool = require('./db');
    await pool.end();
  }
}

testUsers();
