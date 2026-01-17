import crypto from 'crypto';

const requestIdMiddleware = (req,res,next) => {
    const requestId= `REQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
    req.requestId = requestId;
    next();
}

export default requestIdMiddleware;