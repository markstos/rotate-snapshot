
process.env.NODE_CONFIG_DIR="/var/task/config";

var aws    = require("aws-sdk")
  , _      = require("underscore")
  , async  = require("async")
  , config = require("config")
  , ec2   = new aws.EC2({apiVersion: "2015-10-01"})
  ;

var delList = function(snapshots, rotate) {
  return _.chain(snapshots)
          .sortBy(function(o) { return -o.StartTime.getTime(); })
          .rest(rotate)
          .value();
};

// Description, Tags and StartTime are selected only to provide better DryRun output
var delParams = function(snapshots, dryRun) {
  return _.chain(snapshots)
          .map(function(o) { return _.pick(o, "SnapshotId", "Description", "Tags", "StartTime"); })
          .map(function(o) { return _.extend(o, { DryRun: dryRun }); })
          .value();
};

// async map iterator
var iterator = function(params, callback) {
  console.log("Deleted snapshotId : ", params);
  ec2.deleteSnapshot(_.pick(params, "SnapshotId", "DryRun"), function(err, data) {
    if (err) {
      if (err.hasOwnProperty("code") && err.code == "DryRunOperation") {
        data = err;
        err = null;
      }
    }
    callback(err, data);
  });
};

exports.handler = function(ignored, context) {

  // validate event
  if (!config.has("filters")) {
    return context.done("config.filters is required.");
  }
  if (!config.has("dryRun")) {
    return context.done("config.dryRun is required.");
  }
  if (!config.has("rotate")) {
    return context.done("config.rotate is require.");
  }

  // params
  var params = { DryRun: false, Filters: config.get('filters') };

  // describe snapshots and delete them.
  ec2.describeSnapshots(params, function(err, data) {
    if (err) {
      return context.done(err, err.stack);
    }

    // find snapshot ids to delete
    var snapshotIds = delList(data.Snapshots, config.get('rotate'));
    if (+snapshotIds.length == 0) {
      console.log("Do nothing. There is no snapshot to delete.");
      return context.succeed();
    }

    // delete snapshots
    var params = delParams(snapshotIds, config.get("dryRun"));
    async.map(params, iterator, function(err, results) {
      return context.done(err, results);
    });

  });
};
