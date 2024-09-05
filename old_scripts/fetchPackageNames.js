const axios = require('axios');
const cheerio = require('cheerio');

async function fetchPackageNames(maxPages = 20) {
  let allPackages = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://pub.dev/packages?page=${page}`;
    console.log(`Fetching packages from page ${page}...`);

    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);

      const packages = $('.packages-item')
        .map((_, element) => {
          const packageName = $(element).find('.packages-title a').text().trim();
          return packageName;
        })
        .get();

      allPackages = allPackages.concat(packages);

      console.log(`Found ${packages.length} packages on page ${page}`);

    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      break;
    }
  }

  return allPackages;
}

module.exports = fetchPackageNames;

// If this script is run directly, fetch package names for 3 pages
if (require.main === module) {
  fetchPackageNames(20).then(packages => {
    const fs = require('fs');
    fs.writeFileSync('packagesTargetList.json', JSON.stringify(packages, null, 2));
    console.log(`Total packages found: ${packages.length}`);
    console.log('Package names written to packagesTargetList.json');
  });
}

