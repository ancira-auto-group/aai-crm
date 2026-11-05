import { publicUser, requireUser } from '../../../lib/auth.js';
import { json, route } from '../../../lib/http.js';
import { MODELS, modelFor } from '../../../lib/models.js';
import { userMonthUsage } from '../../../lib/usage.js';
import { checkExtensionVersion } from '../../../lib/version.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/me - the signed-in user, their model, and their usage this month */
export const GET = route(async (request) => {
  checkExtensionVersion(request);
  const user = await requireUser(request, { allowPasswordChange: true });
  const model = modelFor(user);

  return json({
    user: publicUser(user),
    model: { id: model, label: MODELS[model].label },
    usageThisMonth: await userMonthUsage(user.id)
  });
});
