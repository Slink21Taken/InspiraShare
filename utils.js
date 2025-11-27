import PocketBase from 'pocketbase';
import argon2 from 'argon2';

const pb = new PocketBase('http://127.0.0.1:8090');

// Password hashing
export async function hashPassword(password) {
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1
    });
  } catch (err) {
    console.error('Hashing failed:', err);
    return null;
  }
}

// Verify password
export async function verifyPassword(hash, inputPassword) {
  try {
    return await argon2.verify(hash, inputPassword);
  } catch (err) {
    console.error('Verification failed:', err);
    return false;
  }
}

// Get room data
export async function getRoomByRoomnum(roomnum) {
  try {
    if (!roomnum || typeof roomnum !== 'string') return null;
    return await pb.collection('Rooms').getFirstListItem(`roomnum="${roomnum}"`);
  } catch (err) {
    console.error('Error fetching room by roomnum:', err);
    return null;
  }
}

// Insert data
export async function insertData(password, roomnum) {
  if (!password || !roomnum) return null;
  try {
    const hashedpswd = await hashPassword(password);
    if (!hashedpswd) return null;
    return await pb.collection('Rooms').create({ password: hashedpswd, roomnum });
  } catch (err) {
    console.error('Error during data insertion:', err);
    return null;
  }
}

// Update data
export async function updateDataByRoomnum(roomnum, newPassword) {
  try {
    const room = await getRoomByRoomnum(roomnum);
    if (!room) return null;
    const newHash = await hashPassword(newPassword);
    if (!newHash) return null;
    return await pb.collection('Rooms').update(room.id, { password: newHash });
  } catch (err) {
    console.error('Update failed:', err);
    return null;
  }
}

// Password check
export async function passwordCheck(roomnum, pswd) {
  try {
    const record = await getRoomByRoomnum(roomnum);
    if (!record || !record.password) return false;
    return await verifyPassword(record.password, pswd);
  } catch (err) {
    console.error('Password check error:', err);
    return false;
  }
}
