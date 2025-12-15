const mediasoup = require('mediasoup');

let worker = null;

async function initMediasoup() {
    try {
        worker = await mediasoup.createWorker({
            logLevel: 'warn',
            rtcMinPort: 10000,
            rtcMaxPort: 11000,
        });
        
        console.log('✅ Mediasoup worker created (PID:', worker.pid, ')');
        
        worker.on('died', () => {
            console.error('❌ Mediasoup worker died, exiting...');
            process.exit(1);
        });
        
        return worker;
    } catch (error) {
        console.error('❌ Failed to create mediasoup worker:', error);
        throw error;
    }
}

module.exports = {
    initMediasoup,
    getWorker: () => worker
};