export const containers = {
  platforms: "platforms",
  news: "news",
  topics: "topics",
  config: "config",
  subscribers: "subscribers",
  contactSubmissions: "contact-submissions",
};

export const partitions = {
  news: "/id",
  // Small sets may use constant partition keys; configure on container creation.
};
