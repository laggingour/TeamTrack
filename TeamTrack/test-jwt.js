
const jwt = require('jsonwebtoken');

const {
  generateToken,
  verifyToken
} = require('./jwt');

// Test user details
const testUser = {
  user_id: '2641bfff-97f8-4266-be38-89cab68165ce',
  role: 'member'
};

try {
  // 1. Generate JWT
  const token = generateToken(testUser);

  console.log('Token generated:', Boolean(token));

  // 2. Verify JWT
  const decoded = verifyToken(token);

  console.log(
    'User ID correct:',
    decoded.userId === testUser.user_id
  );

  console.log(
    'Role correct:',
    decoded.role === testUser.role
  );

  // 3. Check signing algorithm
  const tokenDetails = jwt.decode(token, {
    complete: true
  });

  console.log(
    'Algorithm:',
    tokenDetails.header.alg
  );

  // 4. Check token expiry
  console.log(
    'Expiry:',
    new Date(decoded.exp * 1000).toISOString()
  );

  // 5. Check token expiration duration
  const duration = decoded.exp - decoded.iat;

  console.log(
    'Expires after 8 hours:',
    duration === 8 * 60 * 60
  );

  // 6. Check invalid token
  try {
    verifyToken('invalid.token.value');
    console.log('Invalid token rejected: false');
  } catch (error) {
    console.log('Invalid token rejected: true');
  }

} catch (error) {
  console.error('JWT test failed:', error.message);
}
