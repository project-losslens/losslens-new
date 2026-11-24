// A successful HTTP response with no affected rows is not a successful mutation.
export async function checkedMutation(query) {
  try {
    const result = await query
    if (result.error) return result
    const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : []
    if (!rows.length) return { ...result, error: new Error('No records were changed. Refresh and check your permissions before retrying.') }
    return result
  } catch (error) { return { data: null, error } }
}
