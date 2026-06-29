function permissionCheck(...requirePermissions) {
    return (req, res, next) => {
        const permissions = req.user.permissions || [];

        if (permissions.some(permission => requirePermissions.includes(permission))) {
            next();
        } else {
            // Include a `code` so the frontend can translate the message into the
            // user's language (it maps data.code → errors.<code>). Without a code
            // the client falls back to this English text.
            res.status(403).json({ code: "FORBIDDEN", message: "You don't have permission for this route!", userMessage: "Access Denied" });
        }
    }
}

export default permissionCheck;


// function roleCheck(...requireRoles){
//     return (req,res,next)=>{
//         const role = req.user.role;
//         if (requireRoles.includes(role)) {
//             next();
//         } else {
//             res.status(400).send("you dont have permmission for this route!");
//         }
//     }
// }

// export default roleCheck;