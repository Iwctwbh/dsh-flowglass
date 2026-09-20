// Plain-script prelude shared by static and dynamic Client assembly.
// Stages are recorded before calls so an interrupted receipt is never
// mistaken for a definite failure. Retry keeps already-created sessions.
const flowDurableEvents = (snapshot) => {
  if (!snapshot || !Array.isArray(snapshot.entries)) return null
  const events = snapshot.entries.map((entry) => entry && entry.type === 'event' ? entry.event
    : entry && entry.type !== 'transient' ? entry : null)
    .filter((event) => event && Number.isFinite(event.seq) && event.type !== 'assistant/live-chunk')
  if (snapshot.revision === 0 || (snapshot.revision == null && !events.length)) return null
  return events
}
const runFlowLaunchBatch = async (batch, api, changed) => {
  const notify = () => { batch.updatedAt = Date.now(); changed(batch) }
  for (const item of batch.items) {
    if (item.status === 'success' || item.status === 'unknown' || item.sid) continue
    item.stage = 'create'; item.status = 'pending'; notify()
    try { item.sid = await api.create(item); item.status = 'ready'; notify() }
    catch (error) { item.status = error.definite ? 'failed' : 'unknown'; item.error = String(error.message || error); notify() }
  }
  // All forks must precede sending to a reused source, preserving its prefix.
  for (const item of batch.items) {
    if (!item.sid || item.status === 'success' || item.status === 'unknown') continue
    if (item.stage !== 'send') {
      item.stage = 'configure'; item.status = 'pending'; notify()
      try { await api.configure(item); item.stage = 'send'; item.status = 'ready'; notify() }
      catch (error) { item.status = 'failed'; item.error = String(error.message || error); notify(); continue }
    }
    item.stage = 'send'; item.status = 'pending'; item.startedAt = Date.now(); notify()
    try { await api.send(item, batch.prompt); item.status = 'success'; item.error = ''; notify() }
    catch (error) { item.status = error.definite ? 'failed' : 'unknown'; item.error = String(error.message || error); notify() }
  }
  return batch
}
