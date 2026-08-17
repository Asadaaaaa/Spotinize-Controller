import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export class DeployController {
  static async handleWebhook(req, res) {
    const event = req.headers['x-github-event'];
    const payload = req.body || {};

    // Ping event when webhook is first created on GitHub
    if (event === 'ping') {
      console.log('[CI/CD Webhook] 🏓 GitHub Ping received successfully:', payload.zen);
      return res.status(200).json({ status: 'ok', message: 'Pong! Webhook connected successfully.' });
    }

    if (event !== 'push') {
      return res.status(200).json({ status: 'ignored', message: `Event ${event} ignored` });
    }

    // Only deploy on push to main branch
    if (payload.ref !== 'refs/heads/main') {
      return res.status(200).json({ status: 'ignored', message: `Branch ${payload.ref} ignored (only main is deployed)` });
    }

    const repoName = payload.repository?.name || 'Unknown';
    const commitMsg = payload.head_commit?.message || 'No message';
    const author = payload.head_commit?.author?.name || 'Unknown';

    console.log(`[CI/CD Webhook] 🚀 Push received on ${repoName} (main) by ${author}: "${commitMsg}"`);

    // Acknowledge webhook immediately so GitHub gets 200 OK
    res.status(200).json({ 
      status: 'deploying', 
      repo: repoName,
      commit: payload.head_commit?.id?.slice(0, 7),
      message: 'Build and deployment started in background' 
    });

    // Execute build and deployment asynchronously
    (async () => {
      try {
        if (repoName === 'Spotinize-Web') {
          console.log('[CI/CD] 📦 Building Spotinize-Web...');
          const { stdout } = await execPromise(
            'cd /root/app/spotinize/web && git pull origin main && npm install --prefer-offline && npm run build'
          );
          console.log('[CI/CD] ✅ Spotinize-Web deployed successfully:\n' + stdout);
        } else if (repoName === 'Spotinize-Controller') {
          console.log('[CI/CD] 📦 Deploying Spotinize-Controller...');
          const { stdout } = await execPromise(
            'cd /root/app/spotinize/controller && git pull origin main && npm install --prefer-offline && pm2 restart spotinize-controller'
          );
          console.log('[CI/CD] ✅ Spotinize-Controller updated & restarted:\n' + stdout);
        }
      } catch (err) {
        console.error(`[CI/CD] ❌ Build/Deploy error for ${repoName}:`, err);
      }
    })();
  }
}
