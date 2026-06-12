import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import labValidate from '../validates/labValidate.js';
import labController from '../controllers/labController.js';
import validateIdParam from '../validates/idValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

// ORDERS (registered before /:labId so "orders" is never read as a lab id)
router.post('/orders', permissionMiddleware('manage_lab'), labValidate.createOrder, labController.createOrder);
router.get('/orders', permissionMiddleware('manage_lab'), labValidate.ordersFilters, labController.getOrders);
router.get('/orders/:orderId', permissionMiddleware('manage_lab'), validateIdParam('orderId'), labController.getOrderById);
router.put('/orders/:orderId', permissionMiddleware('manage_lab'), validateIdParam('orderId'), labValidate.updateOrder, labController.updateOrder);
router.patch('/orders/:orderId/status', permissionMiddleware('manage_lab'), validateIdParam('orderId'), labValidate.orderStatus, labController.setOrderStatus);
router.delete('/orders/:orderId', permissionMiddleware('manage_lab'), validateIdParam('orderId'), labController.deleteOrder);

// LABS
router.post('/', permissionMiddleware('manage_lab'), labValidate.createLab, labController.createLab);
router.get('/', permissionMiddleware('manage_lab'), labController.getLabs);
router.get('/search', permissionMiddleware('manage_lab'), labController.searchLabs);
router.get('/:labId', permissionMiddleware('manage_lab'), validateIdParam('labId'), labController.getLabById);
router.put('/:labId', permissionMiddleware('manage_lab'), validateIdParam('labId'), labValidate.updateLab, labController.updateLab);
router.delete('/:labId', permissionMiddleware('manage_lab'), validateIdParam('labId'), labController.deleteLab);

export default router;
