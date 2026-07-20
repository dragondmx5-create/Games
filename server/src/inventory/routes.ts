import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { craftCommandSchema, equipCommandSchema, purchaseCommandSchema } from './schema.js';
import { craftInventoryItem, equipInventoryWeapon, getInventory, purchaseInventoryItem } from './service.js';
import { ITEM_CATALOG, RECIPES, SHOP_OFFERS } from '../economy/catalog.js';
import { assertNearCanonicalMerchant } from '../world/merchantAuthorization.js';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

inventoryRouter.get('/catalog', (_req, res) => {
  res.json({
    items: Object.values(ITEM_CATALOG),
    recipes: Object.values(RECIPES),
    shopOffers: Object.values(SHOP_OFFERS),
  });
});

inventoryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ inventory: await getInventory(req.userId!) });
  }),
);

inventoryRouter.post(
  '/craft',
  asyncHandler(async (req, res) => {
    const command = craftCommandSchema.parse(req.body);
    await assertNearCanonicalMerchant(req.userId!);
    res.json(await craftInventoryItem(req.userId!, command.recipeId, command));
  }),
);

inventoryRouter.post(
  '/purchase',
  asyncHandler(async (req, res) => {
    const command = purchaseCommandSchema.parse(req.body);
    await assertNearCanonicalMerchant(req.userId!);
    res.json(await purchaseInventoryItem(req.userId!, command.offerId, command));
  }),
);

inventoryRouter.post(
  '/equip',
  asyncHandler(async (req, res) => {
    const command = equipCommandSchema.parse(req.body);
    res.json(await equipInventoryWeapon(req.userId!, command.weaponId, command));
  }),
);
