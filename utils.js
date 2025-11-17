import PocketBase from 'pocketbase';
import argon2 from 'argon2';
const pb = new PocketBase('http://127.0.0.1:8090');

//password hashing
export async function hashPassword(password) {
    try {
        const hash = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,
            timeCost: 3,
            parallelism: 1
        });
        return hash;
    } catch (err) {
        console.error("Hashing failed:", err);
    }
}

// verify password
export async function verifyPassword(hash, inputPassword) {
    try {
        return await argon2.verify(hash, inputPassword);
    } catch (err) {
        console.error("Verification failed:", err);
    }
}

//get room data
export async function getRoomByRoomnum(roomnum) {
    try {
        if (!roomnum || typeof roomnum !== 'string') {
            console.error("Roomnum is invalid!");
            return;
        }
        const record = await pb.collection('Rooms').getFirstListItem(`roomnum="${roomnum}"`, {
            expand: 'relField1,relField2.subRelField'
        });
        return record;
    } catch (err) {
        console.error("Error fetching room by roomnum:", err.message);
    }
}

//insert data
export async function insertData(password, roomnum) {
    if (!password || !roomnum) {
        console.error("Missing password or roomnum for insertion!");
        return;
    }
    try {
        const hashedpswd = await hashPassword(password);
        const data = {
            password: hashedpswd,
            roomnum: roomnum
        };
        const commit = await pb.collection('Rooms').create(data);
        return commit;
    } catch (err) {
        console.error("Error during data insertion:", err.message);
    }
}

//update data
export async function updateDataByRoomnum(roomnum, newPassword) {
    try {
        const room = await getRoomByRoomnum(roomnum);
        if (!room) return;

        const newHash = await hashPassword(newPassword);
        const updated = await pb.collection('Rooms').update(room.id, {
            password: newHash
        });
        return updated;
    } catch (err) {
        console.error("Update failed:", err.message);
    }
}

//wrapper for 'good practice'
export async function getRoomDataByRoomnum(roomnum) {
    return await getRoomByRoomnum(roomnum); // reuse logic
}


//password check
export async function passwordCheck(roomnum, pswd) {
    try {
        if (!roomnum || typeof roomnum !== 'string' || !pswd) {
            console.error("Password and roomnumber invalid!");
            return;
        }
        const record = await getRoomByRoomnum(roomnum);
        const hashedpswd = record['password'] 
        let result = await verifyPassword(hashedpswd, pswd)
        if (result){
            return true
        }
        else{
            return false
        }

        
    } catch (err) {
        console.error("Error occurred getting room data:", err.message);
    }
}
