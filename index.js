var aws   = require("aws-sdk")
  , _     = require("underscore")
  , async = require("async")
  , ec2   = new aws.EC2({apiVersion: "2015-10-01"})
  ;

var delList = function(snapshots, rotate) {
  return _.chain(snapshots)
          .sortBy(function(o) { return -o.StartTime.getTime(); })
          .rest(rotate)
          .value();
};

var delParams = function(snapshots, dryRun) {
  return _.chain(snapshots)
          .map(function(o) { return _.pick(o, "SnapshotId"); })
          .map(function(o) { return _.extend(o, { DryRun: dryRun }); })
          .value();
};

// async map iterator
var iterator = function(params, callback) {
  console.log("Deleted snapshotId : ", params);
  ec2.deleteSnapshot(params, function(err, data) {
    if (err) {
      if (err.hasOwnProperty("code") && err.code == "DryRunOperation") {
        data = err;
        err = null;
      }
    }
    callback(err, data);
  });
};

exports.handler = function(event, context) {
  // validate event
  if (!event.hasOwnProperty("filters")) {
    return context.done("event.filters is require.");
  }
  if (!event.hasOwnProperty("dryRun")) {
    return context.done("event.dryRun is require.");
  }
  if (!event.hasOwnProperty("rotate")) {
    return context.done("event.rotate is require.");
  }

  // params
  var params = { DryRun: false, Filters: event.filters };

  // describe snapshots and delete them.
  ec2.describeSnapshots(params, function(err, data) {
    if (err) {
      return context.done(err, err.stack);
    }

    // find snapshot ids to delete
    var snapshotIds = delList(data.Snapshots, event.rotate);
    if (+snapshotIds.length == 0) {
      console.log("Do nothing. There is no snapshot to delete.");
      return context.succeed();
    }

    // delete snapshots
    var params = delParams(snapshotIds, event.dryRun);
    async.map(params, iterator, function(err, results) {
      return context.done(err, results);
    });

  });
};
