import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export const auth = async () => {
  let userId = 'mock_user_12345';
  try {
    const headersList = await headers();
    if (headersList.get('x-mock-unauthorized') === 'true') {
      userId = null;
    }
  } catch (e) {}

  return {
    userId,
    protect: () => {
      if (!userId) {
        throw new Error('Unauthorized');
      }
    },
  };
};

export const currentUser = async () => {
  let userId = 'mock_user_12345';
  try {
    const headersList = await headers();
    if (headersList.get('x-mock-unauthorized') === 'true') {
      return null;
    }
  } catch (e) {}

  return {
    id: userId,
    firstName: 'Jane',
    lastName: 'Doe',
    emailAddresses: [{ emailAddress: 'jane.doe@example.com' }],
    publicMetadata: { role: 'primary' }
  };
};

export const clerkClient = {
  users: {
    getUser: async (id) => ({
      id,
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddresses: [{ emailAddress: 'jane.doe@example.com' }],
      publicMetadata: { role: 'primary' }
    }),
    updateUserMetadata: async (id, metadata) => {
      console.log('Mock updateUserMetadata:', id, metadata);
      return { id };
    }
  }
};

export async function getAuthUserId() {
  return 'mock_user_12345';
}

export function clerkMiddleware(handler) {
  return async (req, event) => {
    if (handler) {
      const mockAuth = {
        userId: 'mock_user_12345',
        protect: async () => {},
      };
      const res = await handler(mockAuth, req, event);
      if (res) return res;
    }
    return NextResponse.next();
  };
}


export function createRouteMatcher() {
  return (req) => false;
}
