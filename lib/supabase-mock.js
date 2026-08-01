// Chainable mock database query builder for integration tests
const makeMockQuery = (data = [], error = null) => {
  const chain = {};
  chain.then = (resolve) => Promise.resolve({ data, error }).then(resolve);
  chain.catch = (reject) => Promise.resolve({ data, error }).catch(reject);
  chain.finally = (callback) => Promise.resolve({ data, error }).finally(callback);

  const handler = {
    get(target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return chain[prop];
      }
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => {
          const singleData = Array.isArray(data) ? (data[0] || null) : data;
          return makeMockQuery(singleData, error);
        };
      }
      return () => new Proxy({}, handler);
    }
  };

  return new Proxy({}, handler);
};

export function createClient(url, key, options) {
  return {
    from: (table) => {
      if (table === 'users') {
        return makeMockQuery([{ id: 'mock_user_12345' }], null);
      }
      if (table === 'cycles') {
        return makeMockQuery([
          { id: '407d5dfc-658b-4a5f-9f7a-8f1ea8e05c2a', start_date: '2026-07-01', end_date: '2026-07-05', cycle_length: 28 }
        ], null);
      }
      if (table === 'daily_logs') {
        return makeMockQuery([
          { date: '2026-07-01', symptoms: ['cramps', 'headache'] }
        ], null);
      }
      if (table === 'weight_entries') {
        return makeMockQuery([
          { recorded_date: '2026-07-01', weight_kg: 60.5, height_cm: 165 }
        ], null);
      }
      if (table === 'user_profiles') {
        return makeMockQuery([
          { user_id: 'mock_user_12345', age: 25, weight_kg: 60.5, height_cm: 165, known_conditions: [], cycle_goal: 'track' }
        ], null);
      }
      if (table === 'forum_posts' || table === 'forum_comments' || table === 'forum_categories') {
        return makeMockQuery([{ id: 'mock-uuid-12345', category_id: 'mock-cat-12345', name: 'General', title: 'Test Title', content: 'Test Content' }], null);
      }
      return makeMockQuery([], null);
    },
    rpc: (name, args) => {
      if (name === 'handle_vote') {
        return Promise.resolve({ data: { action: 'added', current_vote: 1 }, error: null });
      }
      if (name === 'enforce_rate_limit') {
        return Promise.resolve({
          data: {
            allowed: true,
            count: 3,
            reset_at: new Date(Date.now() + 60000).toISOString()
          },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: null });
    }
  };
}
