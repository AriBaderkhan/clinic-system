function roleCheck(...requireRoles){
    return (req,res,next)=>{
        const role = req.user.role;
        if (requireRoles.includes(role)) {
            next();
        } else {
            res.status(400).send("you dont have permmission for this route!");
        }
    }
}

export default roleCheck;