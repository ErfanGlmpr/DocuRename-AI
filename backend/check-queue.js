const { Queue } = require('bullmq');

async function main() {
  const queue = new Queue('document-processing', {
    connection: {
      host: '127.0.0.1',
      port: 6379,
    },
  });

  const active = await queue.getJobs(['active']);
  const waiting = await queue.getJobs(['waiting']);
  const stalled = await queue.getJobs(['stalled']);
  
  console.log('Active Jobs:', active.length);
  active.forEach(j => console.log(`- ${j.id}: ${JSON.stringify(j.data)}`));
  
  console.log('Waiting Jobs:', waiting.length);
  console.log('Stalled Jobs:', stalled.length);

  await queue.close();
}
main();
