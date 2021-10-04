const express = require("express");
const { update } = require("../helpers/stuart");
const router = express.Router();

router.post("/delivery-update", async (req, res) => {
	try {
		//if event is a delivery update
		const {event, type, data } = req.body;
		let response = {
			message: "event unrecognised"
		}
		let jobStatus = null
		if (event && event === "job") {
			if (type && type === "create") {
				console.log("JOB CREATE")
				jobStatus = await update(data, event.toLowerCase())
				response = {...data}
			}
			if (type && type === "update") {
				console.log("JOB UPDATE")
				jobStatus = await update(data, event.toLowerCase())
				response = {...data}
			}
		} else if (event && event === "delivery") {
			if (type && type === "create") {
				console.log("DELIVERY CREATE")
				console.log(data)
				jobStatus = await update(data, event.toLowerCase())
				response = {...data }
			}
			if (type && type === "update") {
				console.log("DELIVERY UPDATE")
				console.log(data)
				jobStatus = await update(data, event.toLowerCase())
				response = {...data }
			}
		}
		return res.status(200).json({
			...response
		})
	} catch (err) {
		console.error(err)
		return res.status(500).json({
			...err
		})
	}
})

module.exports = router;

