// Made-up patient names for the test clinics, in the ways receptionists really type them:
// English letters, Arabizi (7 = h, 3 = a ...), Arabic script and Kurdish script.
export const NAMES = {
    latin: {
        first: ['Hussen', 'Ari', 'Sara', 'Rozh', 'Dilan', 'Karwan', 'Shilan', 'Ahmed', 'Zhino', 'Hawre', 'Lana', 'Omar', 'Bryar', 'Nasik', 'Rebin', 'Avin', 'Mohammed', 'Hana', 'Soran', 'Shno'],
        last: ['Ali', 'Kareem', 'Hassan', 'Mahmood', 'Rashid', 'Jamal', 'Salih', 'Aziz', 'Qadir', 'Othman', 'Faraj', 'Hamid'],
    },
    arabizi: {
        first: ['7ussen', '7usen', '3li', 'A7med', 'Mo7ammed', '7ana', '3umar', 'Sa3d', '7asan', '3aysha'],
        last: ['3li', 'Kare2m', '7assan', 'Ma7mood', 'Ra4id', '3ziz', 'Qadir', '7amid'],
    },
    arabic: {
        first: ['حسين', 'علي', 'سارة', 'أحمد', 'محمد', 'هناء', 'عمر', 'زينب', 'مريم', 'يوسف'],
        last: ['علي', 'كريم', 'حسن', 'محمود', 'رشيد', 'جمال', 'صالح', 'عزيز'],
    },
    kurdish: {
        first: ['حوسێن', 'ئاری', 'ڕۆژ', 'دیلان', 'کاروان', 'شیلان', 'ژینۆ', 'هاوڕێ', 'بریار', 'ڕێبین'],
        last: ['عەلی', 'کەریم', 'حەسەن', 'مەحمود', 'ڕەشید', 'جەمال', 'سالح', 'عەزیز'],
    },
};

// how often each writing style is used
export const NAME_STYLES = [
    ['latin', 0.6],
    ['arabizi', 0.1],
    ['arabic', 0.15],
    ['kurdish', 0.15],
];

export const REFERRALS = ['Social Media', 'Relative & friends', 'Location', 'Old Patient', null];
export const ALLERGIES = ['Penicillin', 'Latex', 'Lidocaine', null, null, null, null, null];
export const CHRONIC = ['Diabetes', 'Hypertension', 'Asthma', null, null, null, null];
export const COMPLAINTS = ['Toothache', 'Bleeding gums', 'Broken tooth', 'Check-up', 'Sensitivity', 'Swelling', null, null];
export const CANCEL_REASONS = ['Patient called to cancel', 'Doctor not available', 'Rescheduled', 'Traffic'];
