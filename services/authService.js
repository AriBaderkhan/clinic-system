import bcrypt from 'bcrypt';
import appError from '../utils/appError.js';

import authModel from '../models/authModel.js';
import docModel from '../models/docModel.js';
// import assistModel from '../models/asistModel.js';
// import assistDocModel from '../models/asistDocModel.js'; // for the future feautures 
import profileModel from '../models/profileModel.js';


const DUMMY_HASH =
    process.env.DUMMY_BCRYPT_HASH ||
    '$2b$10$1VnSDoUZPwK1d5DKFwRz9Oe2C1wq1k2F5qHk0G9mR3lQZ1x7E3J3S';


// in the future when Assistant will add we add badge_no, doctor_name
async function serviceRegistration({ full_name, email, password, role, phone, address, room }) {

    const hashedPassword = await bcrypt.hash(String(password || ''), 10);

    const normalizedEmail = String(email || '').trim().toLowerCase(); // change them to lowerCase in DB should be same
    const user = await authModel.registerUser(normalizedEmail, hashedPassword, role);
    const user_id = user.id;

    if (role === 'doctor' || role === 'super_doctor') {
        await docModel.addDoc(user_id, room);
    }
    // else if (role === 'assistant') {
    //     const doctor = await profileModel.findDocIdByName(doctor_name);
    //     if (!doctor || !doctor.rows || doctor.rows.length === 0) throw appError('DOCTOR_NOT_FOUND', 'Doctor not found',404);
    //     const doctor_id = doctor.rows[0].user_id;
    //     await assistModel.addAsist(user_id, badge_no);
    //     await assistDocModel.asist_doc(doctor_id, user_id);
    // }

    await profileModel.addProfile(user_id, full_name, phone, address);

    return { id: user_id, email: normalizedEmail, role, full_name };
}

async function serviceLogin({ email, password }) {

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await authModel.loginUser(normalizedEmail);


    const pwd = String(password || '');
    const hashToCompare = user ? user.password : DUMMY_HASH;
    const isMatch = await bcrypt.compare(pwd, hashToCompare);

    if (!user || !isMatch) throw appError('UNAUTHORIZED', 'Invalid credentials', 500);

    return {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.full_name
    }
}

export default { serviceRegistration, serviceLogin }