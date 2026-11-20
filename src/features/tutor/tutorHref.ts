export function tutorHref(slug: string, code?: string) {
  const path = '/p/' + encodeURIComponent(slug);
  return (code ? path + '/cp/' + encodeURIComponent(code) : path) + '/tutor';
}
