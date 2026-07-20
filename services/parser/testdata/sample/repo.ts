export function getUser(id: number): string {
  return fetchName(id);
}

function fetchName(id: number): string {
  return `user-${id}`;
}

export class Repo {
  sync(): void {
    getUser(1);
  }
}
