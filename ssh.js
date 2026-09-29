const { NodeSSH } = require('node-ssh');

class SSHClient {
  constructor(config) {
    this.config = config;
    this.ssh = new NodeSSH();
    this.connected = false;
  }

  async connect() {
    try {
      await this.ssh.connect({
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        password: this.config.password
      });
      this.connected = true;
      return { success: true };
    } catch (err) {
      this.connected = false;
      return { success: false, error: err.message };
    }
  }

  async exec(command) {
    if (!this.connected) throw new Error('Не подключено к серверу');
    const result = await this.ssh.execCommand(command);
    return result.stdout;
  }

  async getUptime() {
    const out = await this.exec('uptime');
    return out.trim();
  }

  async getRAM() {
    const out = await this.exec('free -m');

    const memLine = out.split('\n').find(line => line.trim().startsWith('Mem:'));
    const swapLine = out.split('\n').find(line => line.trim().startsWith('Swap:'));

    if (!memLine) return null;

    const memParts = memLine.trim().split(/\s+/);
    const swapParts = swapLine ? swapLine.trim().split(/\s+/) : [];

    const total = parseInt(memParts[1]);
    const used = parseInt(memParts[2]);
    const free = parseInt(memParts[3]);

    const swapTotal = swapParts.length > 1 ? parseInt(swapParts[1]) : 0;
    const swapUsed = swapParts.length > 2 ? parseInt(swapParts[2]) : 0;

    return {
      ram: {
        total,
        used,
        free,
        percent: Math.round((used / total) * 100)
      },
      swap: {
        total: swapTotal,
        used: swapUsed,
        percent: swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0
      }
    };
  }

  async getDisk() {
    const out = await this.exec('df -h');
    const lines = out.split('\n');

    const rootLine = lines.find(line => {
      const parts = line.trim().split(/\s+/);
      return parts[parts.length - 1] === '/';
    });

    if (!rootLine) return null;

    const parts = rootLine.trim().split(/\s+/);

    return {
      filesystem: parts[0],
      size: parts[1],
      used: parts[2],
      avail: parts[3],
      percent: parseInt(parts[4].replace('%', ''))
    };
  }

  async getMetrics() {
    const [uptime, ramData, disk] = await Promise.all([
      this.getUptime(),
      this.getRAM(),
      this.getDisk()
    ]);

    return {
      uptime,
      ram: ramData?.ram,
      swap: ramData?.swap,
      disk
    };
  }

  disconnect() {
    this.ssh.dispose();
    this.connected = false;
  }
}

module.exports = { SSHClient };