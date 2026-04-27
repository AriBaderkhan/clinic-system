function permissionCheck(...requirePermissions) {
    return (req, res, next) => {
        const permissions = req.user.permissions || [];

        if (permissions.some(permission => requirePermissions.includes(permission))) {
            next();
        } else {
            res.status(403).json({ message: "You don't have permission for this route!", userMessage: "Access Denied" });
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