import patientModel from '../models/patientModel.js';
import patientShareModel from '../models/patientShareModel.js';
import appError from '../utils/appError.js';

// Rules:
//   * only the patient's HOME branch shares / stops sharing (needs the share_patient tick: route)
//   * share = the other branch sees the patient + full history and adds its own records
//   * stop sharing is refused once that branch has records for the patient (they would be orphaned)

const visibleHere = async (patient_id, tenant_id, branch_id) => {
    const patient = await patientModel.getPatient(patient_id, tenant_id, branch_id);
    if (!patient) throw appError('PATIENT_NOT_FOUND', 'Patient not found', 404);
    return patient;
}

const mustBeHome = (patient, branch_id) => {
    if (Number(patient.branch_id) !== Number(branch_id)) {
        throw appError('PATIENT_NOT_HOME_BRANCH', 'Only the patient\'s home branch can do this', 403);
    }
}

// for the folder: home branch, who it is shared with, where it can still go
async function getShares(patient_id, caller) {
    const { tenant_id, branch_id } = caller;
    const patient = await visibleHere(patient_id, tenant_id, branch_id);
    const [home, shares] = await Promise.all([
        patientShareModel.getHome(patient_id, tenant_id),
        patientShareModel.listShares(patient_id, tenant_id),
    ]);
    const isHome = Number(patient.branch_id) === Number(branch_id);
    let can_share_to = [];
    if (isHome) {
        const shared = new Set(shares.map((s) => Number(s.branch_id)));
        can_share_to = (await patientShareModel.getOtherBranches(tenant_id, branch_id)).filter((b) => !shared.has(Number(b.id)));
    }
    return {
        home: { branch_id: home.branch_id, branch_name: home.branch_name },
        is_home: isHome,
        shared_with: shares,
        // this branch's own share row (when the patient came from another branch)
        shared_here: shares.find((s) => Number(s.branch_id) === Number(branch_id)) || null,
        can_share_to,
    };
}

async function share(patient_id, target_branch_id, caller) {
    const { id, tenant_id, branch_id } = caller;
    const patient = await visibleHere(patient_id, tenant_id, branch_id);
    mustBeHome(patient, branch_id);
    if (Number(target_branch_id) === Number(branch_id)) throw appError('SAME_BRANCH', 'The patient already belongs to this branch', 400);

    const targets = await patientShareModel.getOtherBranches(tenant_id, branch_id);
    if (!targets.some((b) => Number(b.id) === Number(target_branch_id))) throw appError('BRANCH_NOT_FOUND', 'Branch not found', 404);

    const row = await patientShareModel.addShare(tenant_id, patient_id, target_branch_id, branch_id, id);
    if (!row) throw appError('ALREADY_SHARED', 'The patient is already shared with this branch', 409);
    return getShares(patient_id, caller);
}

async function unshare(patient_id, target_branch_id, caller) {
    const { tenant_id, branch_id } = caller;
    const patient = await visibleHere(patient_id, tenant_id, branch_id);
    mustBeHome(patient, branch_id);
    if (await patientShareModel.hasRecordsInBranch(patient_id, tenant_id, target_branch_id)) {
        throw appError('PATIENT_HAS_RECORDS_IN_BRANCH', 'That branch already has records for this patient, so the sharing stays', 409);
    }
    const removed = await patientShareModel.removeShare(tenant_id, patient_id, target_branch_id);
    if (!removed) throw appError('SHARE_NOT_FOUND', 'The patient is not shared with that branch', 404);
    return getShares(patient_id, caller);
}

// before adding a patient: is this phone already a patient in another branch?
async function phoneElsewhere(phone, caller) {
    const branches = await patientShareModel.findPhoneElsewhere(phone, caller.tenant_id, caller.branch_id);
    return { elsewhere: branches };
}

export default { getShares, share, unshare, phoneElsewhere }
